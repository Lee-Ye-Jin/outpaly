import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

export { ffmpegPath };

/**
 * FFmpeg 실행. totalSec 를 주면 -progress 출력으로 진행률(0~1)을 onProgress 로 알려준다.
 * 실패하면 stderr 마지막 부분을 담은 Error 를 던진다.
 */
export function runFfmpeg(args, { totalSec, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const full = ['-hide_banner', '-y', '-nostats', '-progress', 'pipe:1', ...args];
    const p = spawn(ffmpegPath, full, { windowsHide: true });
    let stderr = '';
    let buf = '';
    p.stderr.on('data', (d) => {
      stderr = (stderr + d).slice(-8000);
    });
    p.stdout.on('data', (d) => {
      buf += d;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        // out_time_us 는 마이크로초
        if (totalSec && onProgress && line.startsWith('out_time_us=')) {
          const us = Number(line.split('=')[1]);
          if (Number.isFinite(us)) onProgress(Math.min(1, us / 1e6 / totalSec));
        }
      }
    });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}\n${stderr}`));
    });
  });
}

/** ffprobe 없이 길이(초) 읽기: `ffmpeg -i` 의 Duration 줄을 파싱 */
export function probeDuration(file) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ['-hide_banner', '-i', file], { windowsHide: true });
    let stderr = '';
    p.stderr.on('data', (d) => (stderr += d));
    p.on('error', reject);
    p.on('close', () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) return reject(new Error(`길이를 읽을 수 없음: ${file}\n${stderr.slice(-1000)}`));
      resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
    });
  });
}
