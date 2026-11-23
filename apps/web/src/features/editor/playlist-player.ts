// 플레이리스트 미리듣기. 영상과 같은 순서·구간·무음으로 이어서 재생한다.
// 시간 계산은 editor-core(렌더러와 같은 코드)를 쓰므로, 여기서 들리는 곡 경계가 MP4 의 곡 경계와 같다.

import { computeStarts, playedDuration, totalDuration } from '@outpaly/editor-core';

export interface PlayerTrack {
  id: string;
  src: string;
  sourceDuration: number;
  trimStart: number;
  trimEnd: number | null;
  gapAfter: number;
  gain: number;
}

export interface PlayerState {
  playing: boolean;
  /** 영상 기준 재생 위치 (초) */
  time: number;
  index: number;
  error: string | null;
}

const TICK_MS = 100;

export class PlaylistPlayer {
  private audio = new Audio();
  private tracks: PlayerTrack[] = [];
  private starts: number[] = [];
  private index = -1;
  private playing = false;
  private time = 0;
  private error: string | null = null;
  /** 곡 뒤 무음 중이면 무음이 끝나는 시각 (performance.now 기준) */
  private gapEndsAt: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly onChange: (s: PlayerState) => void) {
    this.audio.preload = 'auto';
    this.audio.addEventListener('ended', () => this.finishTrack());
    this.audio.addEventListener('error', () => {
      if (!this.playing) return;
      this.error = '곡을 재생하지 못했어요.';
      this.pause();
    });
  }

  get total() {
    return totalDuration(this.tracks);
  }

  /** 곡 목록이 바뀌면(순서·구간 편집) 같은 곡의 같은 지점에서 이어서 재생 */
  setTracks(tracks: PlayerTrack[]) {
    const currentId = this.tracks[this.index]?.id;
    const offset = this.index >= 0 ? this.time - (this.starts[this.index] ?? 0) : 0;
    this.tracks = tracks;
    this.starts = computeStarts(tracks);
    const newIndex = currentId ? tracks.findIndex((t) => t.id === currentId) : -1;
    if (newIndex >= 0) {
      this.index = newIndex;
      this.time = (this.starts[newIndex] ?? 0) + Math.min(offset, playedDuration(tracks[newIndex]!) + tracks[newIndex]!.gapAfter);
      const t = tracks[newIndex]!;
      this.audio.volume = gainToVolume(t.gain);
    } else if (this.index >= 0) {
      // 재생 중인 곡이 빠졌다
      this.stop();
    }
    this.time = Math.min(this.time, this.total);
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  play(from = this.time >= this.total - 0.05 ? 0 : this.time) {
    if (this.tracks.length === 0) return;
    this.error = null;
    this.playing = true;
    this.startAt(from);
    this.timer ??= setInterval(() => this.tick(), TICK_MS);
    this.emit();
  }

  pause() {
    this.playing = false;
    this.audio.pause();
    this.gapEndsAt = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.emit();
  }

  seek(t: number) {
    const clamped = Math.max(0, Math.min(t, this.total));
    if (this.playing) this.startAt(clamped);
    else {
      this.time = clamped;
      this.index = this.indexAt(clamped);
    }
    this.emit();
  }

  destroy() {
    this.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  }

  private stop() {
    this.pause();
    this.index = -1;
    this.time = 0;
  }

  private indexAt(t: number): number {
    for (let i = this.starts.length - 1; i >= 0; i--) if (t >= (this.starts[i] ?? 0)) return i;
    return this.tracks.length ? 0 : -1;
  }

  private startAt(t: number) {
    const i = this.indexAt(t);
    if (i < 0) return this.stop();
    this.index = i;
    this.time = t;
    const track = this.tracks[i]!;
    const offset = t - (this.starts[i] ?? 0);
    const played = playedDuration(track);

    if (offset >= played) {
      // 곡 뒤 무음 구간에서 시작
      this.audio.pause();
      this.gapEndsAt = performance.now() + (played + track.gapAfter - offset) * 1000;
      return;
    }
    this.gapEndsAt = null;
    if (!this.audio.src.endsWith(track.src)) this.audio.src = track.src;
    this.audio.currentTime = track.trimStart + offset;
    this.audio.volume = gainToVolume(track.gain);
    this.audio.play().catch((e: unknown) => {
      if (e instanceof DOMException && e.name === 'AbortError') return; // 곡을 빨리 넘길 때 생기는 정상적인 중단
      this.error = '곡을 재생하지 못했어요.';
      this.pause();
    });
  }

  private finishTrack() {
    if (!this.playing) return;
    const track = this.tracks[this.index];
    if (!track) return this.stop();
    this.audio.pause();
    if (track.gapAfter > 0 && this.gapEndsAt === null) {
      this.gapEndsAt = performance.now() + track.gapAfter * 1000;
      this.time = (this.starts[this.index] ?? 0) + playedDuration(track);
      return;
    }
    this.next();
  }

  private next() {
    this.gapEndsAt = null;
    const nextIndex = this.index + 1;
    if (nextIndex >= this.tracks.length) {
      this.pause();
      this.time = this.total;
      this.emit();
      return;
    }
    this.startAt(this.starts[nextIndex] ?? 0);
  }

  private tick() {
    if (!this.playing) return;
    const track = this.tracks[this.index];
    if (!track) return this.stop();
    const start = this.starts[this.index] ?? 0;

    if (this.gapEndsAt !== null) {
      const remaining = Math.max(0, (this.gapEndsAt - performance.now()) / 1000);
      this.time = start + playedDuration(track) + track.gapAfter - remaining;
      if (remaining <= 0) this.next();
    } else {
      const end = track.trimEnd ?? track.sourceDuration;
      this.time = start + Math.max(0, this.audio.currentTime - track.trimStart);
      if (this.audio.currentTime >= end - 0.03) this.finishTrack();
    }
    this.emit();
  }

  private emit() {
    this.onChange({ playing: this.playing, time: this.time, index: this.index, error: this.error });
  }
}

/** dB → audio.volume (0~1). +dB 는 미리듣기에서 1 로 잘린다 (MP4 에는 정확히 반영) */
export function gainToVolume(db: number): number {
  return Math.max(0, Math.min(1, 10 ** (db / 20)));
}
