// 렌더링 파이프라인 실험
//   1. PREPARING  : 곡 길이 확인, 곡별 프레임 PNG 생성 (drawFrame)
//   2. PROCESSING : 오디오 이어 붙이기 → audio.m4a, 프레임 + 오디오 → MP4
//   3. 검증       : 결과 길이 = 계산한 길이 인지 확인, 타임스탬프 저장
//
// 사용: node src/render.mjs project.sample.json [--out out] [--fps 30] [--preset veryfast]

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { drawFrame } from './draw-frame.mjs';
import { runFfmpeg, probeDuration } from './ffmpeg.mjs';
import { totalDuration, playedDuration, timestampsText, fmtTime } from './timeline.mjs';

const FONT_FAMILY = 'OutPaly Sans';

function registerFonts() {
  // 실험용: Windows 맑은 고딕. 서버에서는 Noto Sans KR 정적 폰트를 이미지에 포함시킨다.
  const candidates = [
    process.env.OUTPALY_FONT_REGULAR,
    process.env.OUTPALY_FONT_BOLD,
    'C:/Windows/Fonts/malgun.ttf',
    'C:/Windows/Fonts/malgunbd.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
  ].filter(Boolean);
  let n = 0;
  for (const p of candidates) {
    try {
      if (GlobalFonts.registerFromPath(p, FONT_FAMILY)) n++;
    } catch {}
  }
  if (n === 0) console.warn('! 한글 글꼴을 찾지 못했어요. OUTPALY_FONT_REGULAR 로 경로를 지정하세요.');
}

function stage(name) {
  const t0 = performance.now();
  process.stdout.write(`\n[${name}] `);
  return () => {
    const sec = (performance.now() - t0) / 1000;
    process.stdout.write(` ${sec.toFixed(1)}s\n`);
    return sec;
  };
}

function bar(p) {
  const n = Math.round(p * 30);
  process.stdout.write(`\r  ${'█'.repeat(n)}${'░'.repeat(30 - n)} ${(p * 100).toFixed(0).padStart(3)}%`);
}

// Windows 경로도 concat 목록에서 안전하게
const ffPath = (p) => path.resolve(p).replace(/\\/g, '/').replace(/'/g, "'\\''");

export async function render(doc, { baseDir, outDir, fps = 30, preset = 'veryfast' }) {
  await fs.mkdir(outDir, { recursive: true });
  const framesDir = path.join(outDir, 'frames');
  await fs.mkdir(framesDir, { recursive: true });
  const timings = {};
  registerFonts();

  // ---------- PREPARING ----------
  let done = stage('PREPARING 곡 길이 확인');
  for (const t of doc.tracks) {
    t.absPath = path.resolve(baseDir, t.file);
    t.sourceDuration = await probeDuration(t.absPath);
  }
  timings.probe = done();

  const total = totalDuration(doc.tracks);
  console.log(`  ${doc.tracks.length}곡, 계산된 전체 길이 ${fmtTime(total)} (${total.toFixed(2)}s)`);

  done = stage('PREPARING 프레임 그리기');
  const bgImage = doc.background.file ? await loadImage(path.resolve(baseDir, doc.background.file)) : null;
  const canvas = createCanvas(doc.output.width, doc.output.height);
  const ctx = canvas.getContext('2d');
  const framePaths = [];
  for (let i = 0; i < doc.tracks.length; i++) {
    drawFrame(ctx, doc, i, bgImage, FONT_FAMILY);
    const p = path.join(framesDir, `frame_${String(i).padStart(3, '0')}.png`);
    await fs.writeFile(p, await canvas.encode('png'));
    framePaths.push(p);
  }
  timings.frames = done();

  // ---------- PROCESSING: 오디오 ----------
  done = stage('PROCESSING 오디오 이어 붙이기');
  const audioPath = path.join(outDir, 'audio.m4a');
  const inputs = doc.tracks.flatMap((t) => ['-i', t.absPath]);
  const chains = doc.tracks.map((t, i) => {
    const f = [];
    const trim = [`start=${t.trimStart ?? 0}`];
    if (t.trimEnd != null) trim.push(`end=${t.trimEnd}`);
    f.push(`atrim=${trim.join(':')}`, 'asetpts=PTS-STARTPTS');
    if (t.gain) f.push(`volume=${t.gain}dB`);
    f.push('aresample=48000', 'aformat=sample_fmts=fltp:channel_layouts=stereo');
    // 곡 뒤 무음 + 계산한 길이에 정확히 맞추기 (mp3 끝 패딩 오차 제거)
    f.push(`apad=whole_dur=${slot(t)}`, `atrim=end=${slot(t)}`);
    return `[${i}:a]${f.join(',')}[a${i}]`;
  });
  const concat = `${doc.tracks.map((_, i) => `[a${i}]`).join('')}concat=n=${doc.tracks.length}:v=0:a=1[aout]`;
  await runFfmpeg(
    [...inputs, '-filter_complex', [...chains, concat].join(';'), '-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', audioPath],
    { totalSec: total, onProgress: bar }
  );
  timings.audio = done();

  // ---------- PROCESSING: 영상 ----------
  done = stage(`PROCESSING 영상 인코딩 (x264 stillimage, ${fps}fps, ${preset})`);
  const listPath = path.join(outDir, 'frames.txt');
  const lines = ['ffconcat version 1.0'];
  doc.tracks.forEach((t, i) => {
    lines.push(`file '${ffPath(framePaths[i])}'`, `duration ${slot(t).toFixed(3)}`);
  });
  // concat 데뮤서는 마지막 항목의 duration 을 쓰려면 같은 파일을 한 번 더 적어야 한다
  lines.push(`file '${ffPath(framePaths.at(-1))}'`);
  await fs.writeFile(listPath, lines.join('\n'));

  const outPath = path.join(outDir, 'output.mp4');
  await runFfmpeg(
    [
      '-f', 'concat', '-safe', '0', '-i', listPath,
      '-i', audioPath,
      '-map', '0:v', '-map', '1:a',
      // 주의: -vf fps=… 를 쓰면 곡 하나 분량의 복제 프레임(4분 x 30fps = 7200장)을
      // 필터가 한꺼번에 쏟아내 메모리가 터진다 (1시간 벤치에서 Cannot allocate memory).
      // 출력 단계의 cfr 복제는 한 장씩 인코더로 넘기므로 메모리가 일정하다.
      '-vf', 'format=yuv420p',
      '-r', String(fps), '-fps_mode', 'cfr',
      '-c:v', 'libx264', '-tune', 'stillimage', '-preset', preset, '-crf', '20',
      '-g', String(fps * 10),
      '-c:a', 'copy',
      '-t', total.toFixed(3),
      '-movflags', '+faststart',
      outPath
    ],
    { totalSec: total, onProgress: bar }
  );
  timings.video = done();

  // ---------- 검증 ----------
  const actual = await probeDuration(outPath);
  const size = (await fs.stat(outPath)).size;
  const stamps = timestampsText(doc.tracks);
  await fs.writeFile(path.join(outDir, 'timestamps.txt'), stamps);

  console.log('\n결과');
  console.log(`  파일        ${outPath}`);
  console.log(`  크기        ${(size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  길이 계산   ${total.toFixed(2)}s`);
  console.log(`  길이 실제   ${actual.toFixed(2)}s  (차이 ${(actual - total).toFixed(2)}s)`);
  console.log(`  실시간 대비 ${(total / (timings.audio + timings.video)).toFixed(0)}배 빠름 (오디오+영상 인코딩 기준)`);
  console.log('\n타임스탬프');
  console.log(stamps.split('\n').map((l) => '  ' + l).join('\n'));

  return { total, actual, size, timings, outPath };

  function slot(t) {
    return +(playedDuration(t) + (t.gapAfter ?? 0)).toFixed(3);
  }
}

// CLI
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (name, def) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : def;
  };
  const projectFile = args.find((a) => a.endsWith('.json')) ?? 'project.sample.json';
  const doc = JSON.parse(await fs.readFile(projectFile, 'utf8'));
  const here = path.dirname(fileURLToPath(import.meta.url));
  await render(doc, {
    baseDir: path.dirname(path.resolve(projectFile)),
    outDir: path.resolve(opt('out', path.join(here, '..', 'out'))),
    fps: Number(opt('fps', 30)),
    preset: opt('preset', 'veryfast')
  });
}
