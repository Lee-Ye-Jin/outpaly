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
