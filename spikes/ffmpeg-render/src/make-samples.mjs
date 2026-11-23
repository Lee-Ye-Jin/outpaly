// 실험용 샘플 만들기: 사인파 음원 2곡(MP3) + 배경 이미지 1장(PNG)
// 실제 음원으로 실험하려면 samples/ 에 파일을 넣고 project.sample.json 의 file 경로만 바꾸면 된다.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { runFfmpeg } from './ffmpeg.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'samples');
await fs.mkdir(dir, { recursive: true });

export async function makeTone(file, { freq, seconds }) {
  // 왼쪽/오른쪽 다른 음 + 앞뒤 페이드 → 실제 곡 경계가 귀로 구분된다
  await runFfmpeg([
    '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${seconds}:sample_rate=44100`,
    '-f', 'lavfi', '-i', `sine=frequency=${freq * 1.5}:duration=${seconds}:sample_rate=44100`,
    '-filter_complex',
    `[0:a][1:a]amerge=inputs=2,volume=0.25,afade=t=in:d=0.5,afade=t=out:st=${seconds - 1}:d=1[a]`,
    '-map', '[a]', '-c:a', 'libmp3lame', '-b:a', '192k', file
  ]);
}

export async function makeBackground(file) {
  const W = 1920, H = 1080;
  const c = createCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#3A2E2A';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#E9B98F';
  g.beginPath();
  g.arc(1410, 360, 140, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#4B3A36';
  g.beginPath();
  g.moveTo(0, 770);
  g.bezierCurveTo(310, 620, 580, 670, 860, 730);
  g.bezierCurveTo(1150, 790, 1440, 620, 1920, 720);
  g.lineTo(1920, 1080);
  g.lineTo(0, 1080);
  g.fill();
  g.fillStyle = '#2A211F';
  g.beginPath();
  g.moveTo(0, 890);
  g.bezierCurveTo(360, 790, 740, 840, 1080, 875);
  g.bezierCurveTo(1400, 905, 1620, 830, 1920, 865);
  g.lineTo(1920, 1080);
  g.lineTo(0, 1080);
  g.fill();
  await fs.writeFile(file, await c.encode('png'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await makeTone(path.join(dir, 'track1.mp3'), { freq: 330, seconds: 20 });
  await makeTone(path.join(dir, 'track2.mp3'), { freq: 440, seconds: 15 });
  await makeBackground(path.join(dir, 'background.png'));
  console.log('samples/ 에 track1.mp3 (20초), track2.mp3 (15초), background.png 를 만들었어요.');
}
