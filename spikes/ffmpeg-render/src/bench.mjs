// 1시간 분량(4분 x 15곡) 렌더링 시간 측정
// 사용: node src/bench.mjs [--fps 30] [--preset veryfast] [--tracks 15]

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTone, makeBackground } from './make-samples.mjs';
import { render } from './render.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const fps = Number(opt('fps', 30));
const preset = opt('preset', 'veryfast');
const count = Number(opt('tracks', 15));
const benchDir = path.join(root, 'samples', 'bench');
await fs.mkdir(benchDir, { recursive: true });

const exists = (p) => fs.access(p).then(() => true, () => false);
const bg = path.join(root, 'samples', 'background.png');
if (!(await exists(bg))) await makeBackground(bg);

process.stdout.write(`샘플 음원 ${count}곡 준비 중…`);
const tracks = [];
for (let i = 0; i < count; i++) {
  const file = path.join(benchDir, `track_${String(i + 1).padStart(2, '0')}.mp3`);
  if (!(await exists(file))) await makeTone(file, { freq: 220 + i * 20, seconds: 240 });
  tracks.push({
    file: path.relative(root, file),
    displayTitle: `Sample Track ${String(i + 1).padStart(2, '0')}`,
    displayArtist: '',
    trimStart: 0,
    trimEnd: null,
    gain: 0,
    gapAfter: 0
  });
}
console.log(' 완료');

const doc = JSON.parse(await fs.readFile(path.join(root, 'project.sample.json'), 'utf8'));
doc.tracks = tracks;
doc.tracklistLayer.position = 'bottom';
doc.tracklistLayer.size = 22;

const r = await render(doc, {
  baseDir: root,
  outDir: path.join(root, 'out', `bench-${fps}fps-${preset}`),
  fps,
  preset
});

console.log('\n벤치마크 요약');
console.log(`  설정       ${count}곡, ${(r.total / 60).toFixed(1)}분, ${fps}fps, preset ${preset}`);
for (const [k, v] of Object.entries(r.timings)) console.log(`  ${k.padEnd(10)} ${v.toFixed(1)}s`);
console.log(`  파일 크기  ${(r.size / 1024 / 1024).toFixed(1)} MB`);
