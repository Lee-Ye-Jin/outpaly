import { describe, expect, it } from 'vitest';
import {
  computeStarts,
  formatTime,
  formatTimePrecise,
  parseTimeInput,
  playedDuration,
  timestampsText,
  totalDuration,
  trackIndexAt
} from './timeline.ts';

const track = (sourceDuration: number, extra: Partial<{ trimStart: number; trimEnd: number | null; gapAfter: number }> = {}) => ({
  sourceDuration,
  trimStart: 0,
  trimEnd: null,
  gapAfter: 0,
  displayTitle: 'T',
  displayArtist: '',
  ...extra
});

describe('timeline', () => {
  it('구간 자르기와 곡 뒤 무음을 반영해 시작 시각을 계산한다', () => {
    const tracks = [track(20, { gapAfter: 1 }), track(15, { trimStart: 2, trimEnd: 14 }), track(30)];
    expect(computeStarts(tracks)).toEqual([0, 21, 33]);
    expect(totalDuration(tracks)).toBe(63);
  });

  it('trimEnd 가 원본보다 길면 원본 길이로 자른다', () => {
    expect(playedDuration(track(10, { trimEnd: 99 }))).toBe(10);
  });

  it('재생 위치로 현재 곡을 찾는다', () => {
    const tracks = [track(10), track(10), track(10)];
    expect(trackIndexAt(tracks, 0)).toBe(0);
    expect(trackIndexAt(tracks, 10)).toBe(1);
    expect(trackIndexAt(tracks, 29.9)).toBe(2);
    expect(trackIndexAt([], 5)).toBe(-1);
  });

  it('유튜브 챕터 형식으로 시간을 쓴다', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(214.9)).toBe('3:34');
    expect(formatTime(3760)).toBe('1:02:40');
  });

  it('구간 편집용 시간 쓰기·읽기', () => {
    expect(formatTimePrecise(62.54)).toBe('1:02.5');
    expect(formatTimePrecise(59.96)).toBe('1:00.0');
    expect(parseTimeInput('1:02.5')).toBe(62.5);
    expect(parseTimeInput(' 62.5 ')).toBe(62.5);
    expect(parseTimeInput('1:00:00')).toBe(3600);
    expect(parseTimeInput('0:05')).toBe(5);
    expect(parseTimeInput('1:75')).toBeNull();
    expect(parseTimeInput('abc')).toBeNull();
    expect(parseTimeInput('')).toBeNull();
    expect(parseTimeInput('-3')).toBeNull();
  });

  it('타임스탬프 목록을 만든다', () => {
    const tracks = [
      { ...track(240), displayTitle: 'Morning Static', displayArtist: 'Sample Artist' },
      { ...track(180), displayTitle: '비 오는 오후', displayArtist: '' }
    ];
    expect(timestampsText(tracks)).toBe('0:00 Morning Static - Sample Artist\n4:00 비 오는 오후');
  });
});
