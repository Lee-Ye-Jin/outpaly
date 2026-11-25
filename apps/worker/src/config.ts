import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegStatic from 'ffmpeg-static';
import { z } from 'zod';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

try {
  process.loadEnvFile(path.join(repoRoot, '.env'));
} catch {
  // 배포 환경: 실제 환경변수만 사용
}

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL 이 필요합니다.'),
  /** API 와 같은 저장소 폴더 */
  STORAGE_DIR: z
    .string()
    .optional()
    .transform((v) => path.resolve(repoRoot, v || '.storage')),
  /** 시스템 ffmpeg 를 쓰려면 경로 지정. 없으면 ffmpeg-static */
  FFMPEG_PATH: z.string().optional(),
  /** 렌더링 임시 파일 위치 (작업이 끝나면 지운다) */
  RENDER_WORK_DIR: z
    .string()
    .optional()
    .transform((v) => path.resolve(v || path.join(os.tmpdir(), 'outpaly-render'))),
  /** 글꼴 파일 폴더. 비우면 @expo-google-fonts 패키지의 Noto Sans/Serif KR 을 쓴다 */
  FONT_DIR: z.string().optional(),
  WORKER_ID: z.string().optional(),
  WORKER_POLL_MS: z.coerce.number().int().positive().default(1000),
  WORKER_HEARTBEAT_MS: z.coerce.number().int().positive().default(5000),
  /** 이 시간 동안 heartbeat 가 없으면 Worker 가 죽은 것으로 본다 */
  WORKER_STALE_MS: z.coerce.number().int().positive().default(60_000),
  RENDER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3)
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error('환경변수 오류:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

const ffmpegPath = parsed.data.FFMPEG_PATH ?? (ffmpegStatic as unknown as string | null);
if (!ffmpegPath) {
  console.error('ffmpeg 를 찾을 수 없어요. FFMPEG_PATH 를 지정하세요.');
  process.exit(1);
}

export const config = {
  ...parsed.data,
  FFMPEG_PATH: ffmpegPath,
  WORKER_ID: parsed.data.WORKER_ID ?? `${os.hostname()}-${process.pid}-${randomBytes(3).toString('hex')}`
};
