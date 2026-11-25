import { spawn } from 'node:child_process';

export class RenderCancelledError extends Error {
  constructor() {
    super('렌더링을 취소했어요.');
  }
}

export interface FfmpegOptions {
  ffmpegPath: string;
  /** 있으면 -progress 출력으로 0~1 진행률을 알린다 */
  totalSec?: number;
  onProgress?: (ratio: number) => void;
  /** abort 하면 ffmpeg 를 바로 종료하고 RenderCancelledError */
  signal?: AbortSignal;
}

/** ffmpeg 실행. 실패하면 stderr 마지막 부분을 담은 Error */
export function runFfmpeg(args: string[], opts: FfmpegOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new RenderCancelledError());
    const full = ['-hide_banner', '-y', '-nostdin', '-nostats', '-progress', 'pipe:1', ...args];
    const p = spawn(opts.ffmpegPath, full, { windowsHide: true });
    let stderr = '';
    let buf = '';
    let cancelled = false;

    const onAbort = () => {
      cancelled = true;
      p.kill('SIGKILL');
    };
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    p.stderr.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-8000);
    });
    p.stdout.on('data', (d: Buffer) => {
      buf += d.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (opts.totalSec && opts.onProgress && line.startsWith('out_time_us=')) {
          const us = Number(line.slice('out_time_us='.length));
          if (Number.isFinite(us) && us >= 0) opts.onProgress(Math.min(1, us / 1e6 / opts.totalSec));
        }
      }
    });
    p.on('error', (e) => {
      opts.signal?.removeEventListener('abort', onAbort);
      reject(e);
    });
    p.on('close', (code) => {
      opts.signal?.removeEventListener('abort', onAbort);
      if (cancelled) reject(new RenderCancelledError());
      else if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}\n${stderr}`));
    });
  });
}

/** ffprobe 없이 길이(초) 읽기: `ffmpeg -i` 의 Duration 줄 */
export function probeDuration(ffmpegPath: string, file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ['-hide_banner', '-i', file], { windowsHide: true });
    let stderr = '';
    p.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    p.on('error', reject);
    p.on('close', () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!m) return reject(new Error(`길이를 읽을 수 없음: ${file}`));
      resolve(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
    });
  });
}
