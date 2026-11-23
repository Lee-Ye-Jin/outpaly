// 렌더링 Worker — Phase 6 에서 구현.
// 파이프라인과 FFmpeg 옵션은 spikes/ffmpeg-render 에서 검증했다 (1시간 영상 약 3.5분, 길이 오차 0).
//
//   BullMQ 작업 수신 → PREPARING (S3 에서 원본 받기, drawFrame 으로 곡별 PNG)
//   → PROCESSING (오디오 잇기 + x264 stillimage, -r 30 -fps_mode cfr)
//   → UPLOADING (S3 업로드, render_outputs 기록) → COMPLETED

import type { RenderStatus } from './status.ts';

const stages: RenderStatus[] = ['QUEUED', 'PREPARING', 'PROCESSING', 'UPLOADING', 'COMPLETED'];
console.log(`OutPaly worker (stub) — 단계: ${stages.join(' → ')}`);
