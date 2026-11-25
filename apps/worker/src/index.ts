// 렌더링 Worker 실행: 대기열을 계속 확인하며 작업을 하나씩 처리한다.
//   npm run dev -w @outpaly/worker

import { PrismaClient } from '@prisma/client';
import { LocalFileStore } from '@outpaly/storage';
import { config } from './config.ts';
import { registerFonts } from './render/fonts.ts';
import { RenderWorker } from './worker.ts';

registerFonts(config.FONT_DIR);

const prisma = new PrismaClient();
const worker = new RenderWorker({
  prisma,
  store: new LocalFileStore(config.STORAGE_DIR),
  ffmpegPath: config.FFMPEG_PATH,
  workDir: config.RENDER_WORK_DIR,
  workerId: config.WORKER_ID,
  heartbeatMs: config.WORKER_HEARTBEAT_MS,
  staleMs: config.WORKER_STALE_MS,
  maxAttempts: config.RENDER_MAX_ATTEMPTS
});

let stopping = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function loop() {
  console.log(`OutPaly worker ${config.WORKER_ID} 시작 · 저장소 ${config.STORAGE_DIR}`);
  while (!stopping) {
    try {
      const didWork = await worker.runOnce();
      if (!didWork) await sleep(config.WORKER_POLL_MS);
    } catch (e) {
      console.error('대기열 확인 실패', e);
      await sleep(5000);
    }
  }
  await prisma.$disconnect();
}

// 처리 중인 작업은 끝까지 마치고 멈춘다. 강제 종료돼도 heartbeat 가 끊겨 다른 Worker 가 이어받는다.
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log('종료 중… (처리 중인 작업을 마치면 멈춰요. 한 번 더 누르면 바로 종료)');
  });
}

void loop();
