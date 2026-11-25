// 작업 하나 처리: 대기열에서 가져오기 → 파이프라인 → 결과 저장 → 상태 기록. 임시 파일은 항상 지운다.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { PrismaClient, RenderJob } from '@prisma/client';
import { RENDER_PROGRESS, type RenderSnapshot } from '@outpaly/shared';
import { renderKey, type FileStore } from '@outpaly/storage';
import { RenderCancelledError } from './render/ffmpeg.ts';
import { renderSnapshot, RenderInputError, type RenderPhase } from './render/pipeline.ts';
import { RenderQueue } from './queue.ts';

export interface WorkerDeps {
  prisma: PrismaClient;
  store: FileStore;
  ffmpegPath: string;
  workDir: string;
  workerId: string;
  heartbeatMs: number;
  staleMs: number;
  maxAttempts: number;
  log?: (msg: string) => void;
}

const PROGRESS_WRITE_MS = 1000;

export class RenderWorker {
  readonly queue: RenderQueue;
  private readonly log: (msg: string) => void;

  constructor(private readonly deps: WorkerDeps) {
    this.queue = new RenderQueue(deps.prisma, deps.workerId);
    this.log = deps.log ?? ((m) => console.log(`[worker ${deps.workerId}] ${m}`));
  }

  /** 대기 작업 하나를 처리. 처리했으면 true, 없었으면 false */
  async runOnce(): Promise<boolean> {
    const recovered = await this.queue.recoverStale(this.deps.staleMs, this.deps.maxAttempts);
    if (recovered > 0) this.log(`멈춘 작업 ${recovered}개를 정리했어요`);
    const job = await this.queue.claimNext();
    if (!job) return false;
    await this.process(job);
    return true;
  }

  private async process(job: RenderJob) {
    const t0 = performance.now();
    this.log(`작업 시작 ${job.id} (시도 ${job.attempts})`);
    const workDir = path.join(this.deps.workDir, job.id);
    const ctrl = new AbortController();
    let stopReason: 'cancel' | 'lost' | null = null;

    // heartbeat + 취소 확인
    const beat = setInterval(() => {
      void this.queue
        .heartbeat(job.id)
        .then((r) => {
          if (r !== 'ok' && !stopReason) {
            stopReason = r;
            ctrl.abort();
          }
        })
        .catch((e: unknown) => this.log(`heartbeat 실패: ${String(e)}`));
    }, this.deps.heartbeatMs);

    // 진행률 기록 (1초에 한 번까지)
    let lastWrite = 0;
    let pending: Promise<void> = Promise.resolve();
    const onProgress = (phase: RenderPhase, ratio: number) => {
      const now = performance.now();
      if (now - lastWrite < PROGRESS_WRITE_MS && ratio < 1) return;
      lastWrite = now;
      const [lo, hi] = RENDER_PROGRESS[phase];
      pending = pending.then(() => this.queue.setProgress(job.id, phase, lo + (hi - lo) * ratio)).catch(() => undefined);
    };

    try {
      await fs.rm(workDir, { recursive: true, force: true });
      await fs.mkdir(workDir, { recursive: true });

      const snapshot = job.snapshot as unknown as RenderSnapshot;
      const result = await renderSnapshot(snapshot, {
        store: this.deps.store,
        ffmpegPath: this.deps.ffmpegPath,
        workDir,
        signal: ctrl.signal,
        onProgress
      });
      await pending;

      // UPLOADING
      await this.queue.setProgress(job.id, 'UPLOADING', RENDER_PROGRESS.UPLOADING[0]);
      if (ctrl.signal.aborted) throw new RenderCancelledError();
      const key = renderKey(job.userId, job.id);
      const { size } = await this.deps.store.putFile(result.outputPath, key, 'video/mp4');
      if (Math.abs(result.actualDuration - result.expectedDuration) > 0.5) {
        this.log(`경고: 길이 차이 ${(result.actualDuration - result.expectedDuration).toFixed(2)}s (${job.id})`);
      }
      await this.queue.complete(job.id, {
        storageKey: key,
        sizeBytes: size,
        duration: result.actualDuration,
        width: result.width,
        height: result.height,
        timestamps: result.timestamps
      });
      this.log(`완료 ${job.id} ${((performance.now() - t0) / 1000).toFixed(1)}s, ${(size / 1024 / 1024).toFixed(1)}MB`);
    } catch (e) {
      await pending;
      if (stopReason === 'lost') {
        this.log(`작업을 잃었어요 (다른 Worker 가 가져감): ${job.id}`);
      } else if (e instanceof RenderCancelledError || stopReason === 'cancel') {
        await this.queue.cancelled(job.id);
        this.log(`취소 ${job.id}`);
      } else if (e instanceof RenderInputError) {
        await this.queue.fail(job.id, e.message);
        this.log(`실패(입력) ${job.id}: ${e.message}`);
      } else {
        await this.queue.fail(job.id, '영상을 만드는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
        this.log(`실패 ${job.id}: ${e instanceof Error ? e.stack : String(e)}`);
      }
    } finally {
      clearInterval(beat);
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
