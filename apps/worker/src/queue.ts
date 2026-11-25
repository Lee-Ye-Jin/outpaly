// PostgreSQL 기반 렌더 작업 대기열 (render_jobs 테이블이 곧 대기열).
// - 가져가기: FOR UPDATE SKIP LOCKED → Worker 가 여러 개여도 한 작업은 한 Worker 만 가져간다
// - heartbeat: 처리 중인 Worker 가 주기적으로 갱신. 오래 멈춘 작업은 다시 대기열로 (최대 시도 횟수까지)
// 작업이 많아지면 같은 인터페이스로 BullMQ(Redis) 구현으로 바꿀 수 있다.
//
// 주의: Prisma 의 DateTime 칸은 "시간대 없는 timestamp" 에 UTC 로 저장된다. 직접 쓰는 SQL 에서 now() 를 그대로 쓰면
// DB 시간대(예: Asia/Seoul)로 저장돼 9시간이 어긋난다 → 항상 UTC_NOW 를 쓴다. (테스트가 잡아낸 버그)

import { Prisma, type PrismaClient, type RenderJob } from '@prisma/client';

const UTC_NOW = Prisma.sql`(now() AT TIME ZONE 'UTC')`;

export class RenderQueue {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly workerId: string
  ) {}

  /** 가장 오래된 대기 작업 하나를 가져가고 PREPARING 으로 바꾼다. 없으면 null */
  async claimNext(): Promise<RenderJob | null> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE render_jobs
         SET status = 'PREPARING'::"RenderStatus",
             attempts = attempts + 1,
             heartbeat_at = ${UTC_NOW},
             worker_id = ${this.workerId},
             started_at = COALESCE(started_at, ${UTC_NOW}),
             progress = 0,
             error = NULL
       WHERE id = (
         SELECT id FROM render_jobs
          WHERE status = 'QUEUED'::"RenderStatus" AND NOT cancel_requested
          ORDER BY created_at
          FOR UPDATE SKIP LOCKED
          LIMIT 1)
      RETURNING id`;
    const id = rows[0]?.id;
    return id ? this.prisma.renderJob.findUnique({ where: { id } }) : null;
  }

  /**
   * 살아 있음 알리기. 돌려주는 값:
   * - 'ok'        계속
   * - 'cancel'    사용자가 취소 요청
   * - 'lost'      이 작업이 더 이상 내 것이 아님 (오래 멈춰서 다른 Worker 에게 넘어감)
   */
  async heartbeat(jobId: string): Promise<'ok' | 'cancel' | 'lost'> {
    const job = await this.prisma.renderJob.updateManyAndReturn({
      where: { id: jobId, workerId: this.workerId, status: { in: ['PREPARING', 'PROCESSING', 'UPLOADING'] } },
      data: { heartbeatAt: new Date() },
      select: { cancelRequested: true }
    });
    if (job.length === 0) return 'lost';
    return job[0]!.cancelRequested ? 'cancel' : 'ok';
  }

  /** 단계·진행률 갱신 (내 작업일 때만) */
  async setProgress(jobId: string, status: 'PREPARING' | 'PROCESSING' | 'UPLOADING', progress: number) {
    await this.prisma.renderJob.updateMany({
      where: { id: jobId, workerId: this.workerId, status: { in: ['PREPARING', 'PROCESSING', 'UPLOADING'] } },
      data: { status, progress: Math.round(progress), heartbeatAt: new Date() }
    });
  }

  async complete(jobId: string, output: { storageKey: string; sizeBytes: number; duration: number; width: number; height: number; timestamps: string }) {
    await this.prisma.$transaction([
      this.prisma.renderOutput.create({
        data: { renderJobId: jobId, ...output, sizeBytes: BigInt(output.sizeBytes) }
      }),
      this.prisma.renderJob.update({
        where: { id: jobId },
        data: { status: 'COMPLETED', progress: 100, finishedAt: new Date(), heartbeatAt: null }
      })
    ]);
  }

  async fail(jobId: string, message: string) {
    await this.prisma.renderJob.updateMany({
      where: { id: jobId, workerId: this.workerId },
      data: { status: 'FAILED', error: message, finishedAt: new Date(), heartbeatAt: null }
    });
  }

  async cancelled(jobId: string) {
    await this.prisma.renderJob.updateMany({
      where: { id: jobId, workerId: this.workerId },
      data: { status: 'CANCELLED', finishedAt: new Date(), heartbeatAt: null }
    });
  }

  /**
   * heartbeat 가 끊긴 작업 정리 (Worker 가 죽었거나 서버가 꺼진 경우).
   * 취소 요청된 것은 CANCELLED, 시도 횟수가 남았으면 QUEUED 로 되돌리고, 다 썼으면 FAILED.
   */
  async recoverStale(staleMs: number, maxAttempts: number): Promise<number> {
    const staleSeconds = staleMs / 1000;
    return this.prisma.$executeRaw`
      UPDATE render_jobs
         SET status = CASE
                        WHEN cancel_requested THEN 'CANCELLED'::"RenderStatus"
                        WHEN attempts >= ${maxAttempts} THEN 'FAILED'::"RenderStatus"
                        ELSE 'QUEUED'::"RenderStatus"
                      END,
             error = CASE
                       WHEN NOT cancel_requested AND attempts >= ${maxAttempts}
                       THEN '렌더링 서버에 문제가 생겨 여러 번 시도했지만 완료하지 못했어요. 다시 요청해 주세요.'
                       ELSE error
                     END,
             finished_at = CASE WHEN cancel_requested OR attempts >= ${maxAttempts} THEN ${UTC_NOW} ELSE NULL END,
             worker_id = NULL,
             heartbeat_at = NULL,
             progress = 0
       WHERE status IN ('PREPARING'::"RenderStatus", 'PROCESSING'::"RenderStatus", 'UPLOADING'::"RenderStatus")
         AND (heartbeat_at IS NULL OR heartbeat_at < ${UTC_NOW} - make_interval(secs => ${staleSeconds}))`;
  }
}
