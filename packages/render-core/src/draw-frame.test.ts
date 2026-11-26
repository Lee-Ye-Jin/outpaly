import { describe, expect, it } from 'vitest';
import { createDefaultSettings, type ProjectDoc } from '@outpaly/shared';
import { backgroundRect, drawFrame, type FrameContext } from './draw-frame.ts';

const bg = (over: Partial<{ fit: 'cover' | 'contain'; zoom: number; focusX: number; focusY: number }> = {}) => ({
  fit: 'cover' as const,
  zoom: 1,
  focusX: 0.5,
  focusY: 0.5,
  ...over
});

describe('backgroundRect', () => {
  it('cover: 세로로 긴 사진은 가로를 꽉 채우고 위아래를 가운데 기준으로 자른다', () => {
    const r = backgroundRect({ width: 1000, height: 2000 }, bg());
    expect(r).toEqual({ x: 0, y: (1080 - 3840) / 2, w: 1920, h: 3840 });
  });

  it('cover + focusY=0 이면 사진 맨 위가 보인다, 1 이면 맨 아래', () => {
    expect(backgroundRect({ width: 1000, height: 2000 }, bg({ focusY: 0 })).y).toBeCloseTo(0); // -0 도 같은 위치
    expect(backgroundRect({ width: 1000, height: 2000 }, bg({ focusY: 1 })).y).toBe(1080 - 3840);
  });

  it('contain: 이미지 전체가 보이고 남는 곳이 생긴다', () => {
    const r = backgroundRect({ width: 1000, height: 1000 }, bg({ fit: 'contain' }));
    expect(r).toEqual({ x: (1920 - 1080) / 2, y: 0, w: 1080, h: 1080 });
  });

  it('zoom 2 는 두 배로 키우고 가운데를 유지한다', () => {
    const r = backgroundRect({ width: 1920, height: 1080 }, bg({ zoom: 2 }));
    expect(r).toEqual({ x: -960, y: -540, w: 3840, h: 2160 });
  });
});

/** 호출을 기록하는 가짜 캔버스 */
function recorder(scale = 1) {
  const calls: { op: string; shadowBlur: number; shadowColor: string }[] = [];
  const ctx: FrameContext = {
    fillStyle: '',
    font: '',
    globalAlpha: 1,
    textBaseline: '',
    shadowColor: 'rgba(0,0,0,0)',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    save() {},
    restore() {},
    scale() {},
    fillRect() {
      calls.push({ op: 'rect', shadowBlur: ctx.shadowBlur, shadowColor: ctx.shadowColor });
    },
    fillText() {
      calls.push({ op: 'text', shadowBlur: ctx.shadowBlur, shadowColor: ctx.shadowColor });
    },
    measureText: (t) => ({ width: t.length * 10 }),
    drawImage() {
      calls.push({ op: 'image', shadowBlur: ctx.shadowBlur, shadowColor: ctx.shadowColor });
    },
    getTransform: () => ({ a: scale, b: 0 })
  };
  return { ctx, calls };
}

const doc = (shadow: boolean): ProjectDoc => {
  const s = createDefaultSettings('제목');
  s.titleLayer.shadow = shadow;
  s.tracklistLayer.shadow = shadow;
  return { ...s, title: '제목', tracks: [] };
};

describe('drawFrame 글자 그림자', () => {
  it('그림자를 켜면 글자에만 그림자, 배경에는 없다', () => {
    const { ctx, calls } = recorder();
    drawFrame(ctx, doc(true), -1, null);
    expect(calls.filter((c) => c.op === 'rect').every((c) => c.shadowBlur === 0)).toBe(true);
    expect(calls.filter((c) => c.op === 'text').every((c) => c.shadowBlur > 0)).toBe(true);
  });

  it('그림자를 끄면 그림자가 없다', () => {
    const { ctx, calls } = recorder();
    drawFrame(ctx, doc(false), -1, null);
    expect(calls.every((c) => c.shadowBlur === 0)).toBe(true);
  });

  it('작게 그릴 때(썸네일)는 그림자도 같은 비율로 작아진다', () => {
    const full = recorder(1);
    const thumb = recorder(0.25);
    drawFrame(full.ctx, doc(true), -1, null);
    drawFrame(thumb.ctx, doc(true), -1, null);
    const blur = (cs: typeof full.calls) => cs.find((c) => c.op === 'text')!.shadowBlur;
    expect(blur(thumb.calls)).toBeCloseTo(blur(full.calls) * 0.25, 6);
  });
});

// ---------- 배치 (직접 배치·정렬·열·줄 간격) ----------

/** fillText 의 글자와 x 를 기록하는 가짜 캔버스 (글자 하나 = 10px) */
function textRecorder() {
  const texts: { text: string; x: number; y: number }[] = [];
  const ctx: FrameContext = {
    fillStyle: '',
    font: '',
    globalAlpha: 1,
    textBaseline: '',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    save() {},
    restore() {},
    scale() {},
    fillRect() {},
    fillText(text, x, y) {
      texts.push({ text, x, y });
    },
    measureText: (t) => ({ width: t.length * 10 }),
    drawImage() {}
  };
  return { ctx, texts };
}

const withTracks = (n: number, tweak: (s: ReturnType<typeof createDefaultSettings>) => void = () => {}): ProjectDoc => {
  const s = createDefaultSettings('제목');
  s.tracklistLayer.showTimestamps = false;
  tweak(s);
  return {
    ...s,
    title: '제목',
    tracks: Array.from({ length: n }, (_, i) => ({
      id: `t${i}`,
      trackId: `t${i}`,
      displayTitle: `곡${i}`,
      displayArtist: '',
      sourceDuration: 60,
      trimStart: 0,
      trimEnd: null,
      gain: 0,
      gapAfter: 0
    }))
  };
};

describe('drawFrame 배치', () => {
  it('기본 배치(오른쪽)는 예전과 같은 자리에 그린다 (기존 프로젝트의 모양이 바뀌지 않음)', () => {
    const { ctx, texts } = textRecorder();
    const layout = drawFrame(ctx, withTracks(3), -1, null);
    expect(layout.tracklist!.x).toBeCloseTo(1920 - 35 * 19.2);
    expect(layout.tracklist!.y).toBeCloseTo(14 * 19.2);
    expect(layout.tracklist!.w).toBeCloseTo(30 * 19.2);
    const first = texts.find((t) => t.text === '곡0')!;
    expect(first.x).toBeCloseTo(1920 - 35 * 19.2);
    // 제목도 예전 위치 (왼쪽 정렬, x = 5%)
    expect(layout.title!.x).toBeCloseTo(96);
  });

  it('직접 배치(box)가 있으면 기본 배치 대신 그 자리에 그린다', () => {
    const { ctx } = textRecorder();
    const layout = drawFrame(ctx, withTracks(3, (s) => (s.tracklistLayer.box = { x: 0.25, y: 0.5, width: 0.5 })), -1, null);
    expect(layout.tracklist).toMatchObject({ x: 480, y: 540, w: 960 });
  });

  it('열 개수와 줄 간격이 높이에 반영된다', () => {
    const h = (tweak: (s: ReturnType<typeof createDefaultSettings>) => void) => drawFrame(textRecorder().ctx, withTracks(6, tweak), -1, null).tracklist!.h;
    const base = h(() => {});
    expect(h((s) => (s.tracklistLayer.columns = 2))).toBeCloseTo(base / 2); // 6줄 → 3줄
    expect(h((s) => (s.tracklistLayer.lineSpacing = 1.5))).toBeCloseTo(base * 1.5);
  });

  it('트랙리스트 정렬: 오른쪽 정렬이면 각 줄이 칸 오른쪽 끝에 맞는다', () => {
    const { ctx, texts } = textRecorder();
    drawFrame(ctx, withTracks(2, (s) => {
      s.tracklistLayer.box = { x: 0.1, y: 0.1, width: 0.5 };
      s.tracklistLayer.align = 'right';
    }), -1, null);
    const line = texts.find((t) => t.text === '곡0')!;
    expect(line.x + '곡0'.length * 10).toBeCloseTo(192 + 960);
  });

  it('제목 가운데 정렬: position.x 가 제목 덩어리의 가운데가 된다', () => {
    const { ctx, texts } = textRecorder();
    const layout = drawFrame(ctx, withTracks(0, (s) => {
      s.titleLayer.align = 'center';
      s.titleLayer.position = { x: 0.5, y: 0.4 };
      s.titleLayer.text = '가운데';
      s.titleLayer.subtitle = '부제는 더 길어요';
    }), -1, null);
    expect(layout.title!.x + layout.title!.w / 2).toBeCloseTo(960);
    const title = texts.find((t) => t.text === '가운데')!;
    expect(title.x + 30 / 2).toBeCloseTo(960); // 짧은 제목도 가운데
  });
});
