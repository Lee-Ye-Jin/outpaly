// 렌더 파이프라인 (DB 를 모르는 순수 단계). spikes/ffmpeg-render 에서 검증한 방식:
//   1. 곡마다 drawFrame() 으로 1920x1080 PNG 한 장 (화면은 Canvas 가 그린다, drawtext 안 씀)
//   2. 오디오: 곡별 atrim·volume·무음 → 계산한 길이에 정확히 맞춰 concat → AAC
//   3. 영상: PNG 를 곡 길이만큼 보여 주는 concat 목록 → x264 stillimage (오디오와 동시에)
//   4. 합치기: -c copy (재인코딩 없음) + faststart
// 주의: -vf fps=… 는 긴 정지 화면에서 복제 프레임을 한꺼번에 만들어 메모리가 터진다 → -r + -fps_mode cfr

import fs from 'node:fs/promises';
import path from 'node:path';
import { createCanvas, loadImage, type Image } from '@napi-rs/canvas';
import { slotDuration, timestampsText, totalDuration } from '@outpaly/editor-core';
import { drawFrame, serverFonts, type FrameContext } from '@outpaly/render-core';
import type { RenderSnapshot } from '@outpaly/shared';
import type { FileStore } from '@outpaly/storage';
import { probeDuration, RenderCancelledError, runFfmpeg } from './ffmpeg.ts';

/** 사용자에게 그대로 보여 줘도 되는 실패 이유 */
export class RenderInputError extends Error {}

export type RenderPhase = 'PREPARING' | 'PROCESSING';

export interface PipelineContext {
  store: FileStore;
  ffmpegPath: string;
  /** 이 작업 전용 빈 폴더 */
  workDir: string;
  signal?: AbortSignal;
  /** phase 안에서의 진행률 0~1 */
  onProgress?: (phase: RenderPhase, ratio: number) => void;
}

export interface PipelineResult {
  outputPath: string;
  /** 계산한 영상 길이 (초) */
  expectedDuration: number;
  /** 실제 MP4 길이 */
  actualDuration: number;
  width: number;
  height: number;
  timestamps: string;
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new RenderCancelledError();
}

/** concat 목록용 경로: 슬래시 + 작은따옴표 이스케이프 */
const listPath = (p: string) => path.resolve(p).replace(/\\/g, '/').replace(/'/g, "'\\''");
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export async function renderSnapshot(snapshot: RenderSnapshot, ctx: PipelineContext): Promise<PipelineResult> {
  const { doc, sources } = snapshot;
  const { width, height, fps } = doc.output;
  const report = (phase: RenderPhase, r: number) => ctx.onProgress?.(phase, Math.max(0, Math.min(1, r)));
  if (doc.tracks.length === 0) throw new RenderInputError('곡이 없어요. 곡을 추가한 뒤 다시 시도해 주세요.');

  const total = r3(totalDuration(doc.tracks));
  const slot = (i: number) => r3(slotDuration(doc.tracks[i]!));

  // ---------- 1. PREPARING: 원본 확인 + 프레임 ----------
  report('PREPARING', 0);
  const inputs: string[] = [];
  for (const t of doc.tracks) {
    const src = sources[t.id];
    if (!src || !(await ctx.store.stat(src.storageKey))) {
      throw new RenderInputError(`"${t.displayTitle}" 원본 파일을 찾을 수 없어요. 곡을 다시 올려 주세요.`);
    }
    inputs.push(await ctx.store.withLocalFile(src.storageKey, async (p) => p));
  }

  // 배경 이미지: 업로드 때 회전 반영·메타데이터 제거를 마친 파일이라 브라우저 미리보기와 같은 모습이다
  let bg: Image | null = null;
  if (snapshot.background) {
    const { storageKey } = snapshot.background;
    if (!(await ctx.store.stat(storageKey))) {
      throw new RenderInputError('배경 이미지 파일을 찾을 수 없어요. 편집기에서 배경을 다시 골라 주세요.');
    }
    bg = await ctx.store.withLocalFile(storageKey, (p) => loadImage(p));
  }
  const canvas = createCanvas(width, height);
  const c2d = canvas.getContext('2d') as unknown as FrameContext<Image>;
  const frames: string[] = [];
  for (let i = 0; i < doc.tracks.length; i++) {
    throwIfCancelled(ctx.signal);
    drawFrame(c2d, doc, i, bg, serverFonts);
    const file = path.join(ctx.workDir, `frame_${String(i).padStart(3, '0')}.png`);
    await fs.writeFile(file, await canvas.encode('png'));
    frames.push(file);
    report('PREPARING', (i + 1) / doc.tracks.length);
  }
  throwIfCancelled(ctx.signal);

  // 영상 입력 목록은 인코딩을 시작하기 전에 만든다.
  // (오디오 인코딩을 먼저 시작하고 여기서 await 하면, 그 사이 오디오가 실패했을 때 처리되지 않은 오류가 되어
  //  Worker 프로세스가 죽을 수 있다 — 테스트가 잡아낸 버그)
  const framesList = path.join(ctx.workDir, 'frames.txt');
  const lines = ['ffconcat version 1.0'];
  frames.forEach((f, i) => lines.push(`file '${listPath(f)}'`, `duration ${slot(i).toFixed(3)}`));
  lines.push(`file '${listPath(frames.at(-1)!)}'`); // concat 은 마지막 항목을 한 번 더 적어야 duration 이 적용된다
  await fs.writeFile(framesList, lines.join('\n'));

  // ---------- 2~3. PROCESSING: 오디오·영상 동시 인코딩 ----------
  let audioP = 0;
  let videoP = 0;
  let muxP = 0;
  // 오디오·영상 각 45%, 합치기 10%
  const processing = () => report('PROCESSING', audioP * 0.45 + videoP * 0.45 + muxP * 0.1);

  // 오디오·영상 중 하나가 실패(또는 취소)하면 다른 하나도 바로 멈춘다
  const inner = new AbortController();
  const both = ctx.signal ? AbortSignal.any([ctx.signal, inner.signal]) : inner.signal;

  const audioPath = path.join(ctx.workDir, 'audio.m4a');
  const chains = doc.tracks.map((t, i) => {
    const f = [`atrim=start=${t.trimStart}${t.trimEnd !== null ? `:end=${t.trimEnd}` : ''}`, 'asetpts=PTS-STARTPTS'];
    if (t.gain) f.push(`volume=${t.gain}dB`);
    f.push('aresample=48000', 'aformat=sample_fmts=fltp:channel_layouts=stereo');
    // 곡 뒤 무음 + MP3 끝 패딩 오차 제거: 계산한 칸 길이에 정확히 맞춘다 (타임스탬프 = 실제 곡 경계)
    f.push(`apad=whole_dur=${slot(i)}`, `atrim=end=${slot(i)}`);
    return `[${i}:a]${f.join(',')}[a${i}]`;
  });
  const concat = `${doc.tracks.map((_, i) => `[a${i}]`).join('')}concat=n=${doc.tracks.length}:v=0:a=1[aout]`;
  const audio = runFfmpeg(
    [...inputs.flatMap((p) => ['-i', p]), '-filter_complex', [...chains, concat].join(';'), '-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', audioPath],
    {
      ffmpegPath: ctx.ffmpegPath,
      signal: both,
      totalSec: total,
      onProgress: (r) => {
        audioP = r;
        processing();
      }
    }
  );

  const videoPath = path.join(ctx.workDir, 'video.mp4');
  const video = runFfmpeg(
    [
      '-f', 'concat', '-safe', '0', '-i', framesList,
      '-vf', 'format=yuv420p',
      '-r', String(fps), '-fps_mode', 'cfr',
      '-c:v', 'libx264', '-tune', 'stillimage', '-preset', 'veryfast', '-crf', '20',
      '-g', String(fps * 10),
      '-t', total.toFixed(3),
      '-an',
      videoPath
    ],
    {
      ffmpegPath: ctx.ffmpegPath,
      signal: both,
      totalSec: total,
      onProgress: (r) => {
        videoP = r;
        processing();
      }
    }
  );

  const stopOther = (e: unknown) => {
    inner.abort();
    throw e;
  };
  try {
    await Promise.all([audio.catch(stopOther), video.catch(stopOther)]);
  } catch (e) {
    // 사용자가 취소했으면 그 사실을, 아니면 먼저 난 오류를 알린다 (멈춘 쪽의 "취소" 오류가 아니라)
    await Promise.allSettled([audio, video]);
    if (ctx.signal?.aborted) throw new RenderCancelledError();
    throw e;
  }

  const outputPath = path.join(ctx.workDir, 'output.mp4');
  await runFfmpeg(['-i', videoPath, '-i', audioPath, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-t', total.toFixed(3), '-movflags', '+faststart', outputPath], {
    ffmpegPath: ctx.ffmpegPath,
    signal: ctx.signal,
    totalSec: total,
    onProgress: (r) => {
      muxP = r;
      processing();
    }
  });
  report('PROCESSING', 1);

  const actualDuration = await probeDuration(ctx.ffmpegPath, outputPath);
  return {
    outputPath,
    expectedDuration: total,
    actualDuration,
    width,
    height,
    timestamps: timestampsText(doc.tracks)
  };
}

