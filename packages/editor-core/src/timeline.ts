// 곡별 시작 시각 계산. 미리보기·타임스탬프·렌더러가 모두 이 함수만 쓴다.
// spikes/ffmpeg-render 에서 1시간 분량으로 검증 (계산 길이 = 실제 영상 길이, 오차 0.00s)

import type { ProjectTrackDoc } from '@outpaly/shared';

type TimingTrack = Pick<ProjectTrackDoc, 'sourceDuration' | 'trimStart' | 'trimEnd' | 'gapAfter'>;

/** 영상에서 실제로 재생되는 길이 (잘라낸 구간) */
export function playedDuration(t: TimingTrack): number {
  const end = Math.min(t.trimEnd ?? t.sourceDuration, t.sourceDuration);
  return Math.max(0, end - t.trimStart);
}

/** 영상에서 이 곡이 차지하는 칸 = 재생 길이 + 곡 뒤 무음 */
export function slotDuration(t: TimingTrack): number {
  return playedDuration(t) + t.gapAfter;
}

export function computeStarts(tracks: readonly TimingTrack[]): number[] {
  let acc = 0;
  return tracks.map((t) => {
    const start = acc;
    acc += slotDuration(t);
    return start;
  });
}

export function totalDuration(tracks: readonly TimingTrack[]): number {
  return tracks.reduce((sum, t) => sum + slotDuration(t), 0);
}

/** 재생 위치(초)가 몇 번째 곡인지. 범위 밖이면 가장 가까운 끝 곡. */
export function trackIndexAt(tracks: readonly TimingTrack[], time: number): number {
  if (tracks.length === 0) return -1;
  const starts = computeStarts(tracks);
  for (let i = starts.length - 1; i >= 0; i--) {
    if (time >= (starts[i] ?? 0)) return i;
  }
  return 0;
}

/** 유튜브 챕터 형식: 0:00, 3:34, 1:02:40 */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** 구간 편집용: 소수 첫째 자리까지. 62.5 → "1:02.5", 3600 → "1:00:00.0" */
export function formatTimePrecise(sec: number): string {
  const tenths = Math.round(Math.max(0, sec) * 10);
  const whole = Math.floor(tenths / 10);
  return `${formatTime(whole)}.${tenths % 10}`;
}

/**
 * 사용자가 입력한 시간 → 초. "1:02.5", "62.5", "1:00:00" 을 받는다. 해석할 수 없으면 null.
 * 분·초 자리는 60 미만이어야 한다 ("1:75" 는 null).
 */
export function parseTimeInput(input: string): number | null {
  const s = input.trim();
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(s)) return null;
  const [main, frac = ''] = s.split('.');
  const parts = main!.split(':').map(Number);
  if (parts.slice(1).some((p) => p >= 60)) return null;
  const whole = parts.reduce((acc, p) => acc * 60 + p, 0);
  return whole + (frac ? Number(`0.${frac}`) : 0);
}

/** 유튜브 설명란에 붙일 타임스탬프 목록 */
export function timestampsText(
  tracks: readonly (TimingTrack & Pick<ProjectTrackDoc, 'displayTitle' | 'displayArtist'>)[]
): string {
  const starts = computeStarts(tracks);
  return tracks
    .map((t, i) => {
      const artist = t.displayArtist ? ` - ${t.displayArtist}` : '';
      return `${formatTime(starts[i] ?? 0)} ${t.displayTitle}${artist}`;
    })
    .join('\n');
}
