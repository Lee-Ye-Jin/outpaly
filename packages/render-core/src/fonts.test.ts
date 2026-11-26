import { describe, expect, it } from 'vitest';
import { FONT_IDS } from '@outpaly/shared';
import { actualWeight, browserFonts, serverFonts } from './fonts.ts';

describe('글꼴 굵기 대응', () => {
  it('굵은 파일이 없는 글꼴은 "굵게"도 보통 굵기로 (브라우저가 가짜 굵게를 만들지 않게)', () => {
    expect(actualWeight('jua', 700)).toBe(400);
    expect(browserFonts('jua', 700)).toEqual({ family: 'Jua', weight: 400 });
    expect(serverFonts('jua', 700)).toEqual({ family: 'Jua 400', weight: 400 });
  });

  it('보통이 400 이 아닌 글꼴은 실제 굵기를 쓴다 (해바라기: 500/700)', () => {
    expect(browserFonts('sunflower', 400)).toEqual({ family: 'Sunflower', weight: 500 });
    expect(serverFonts('sunflower', 700).family).toBe('Sunflower 700');
  });

  it('모든 글꼴이 브라우저·서버에서 같은 굵기를 고른다', () => {
    for (const id of FONT_IDS) {
      for (const w of [400, 700] as const) {
        expect(serverFonts(id, w).family.endsWith(` ${browserFonts(id, w).weight}`)).toBe(true);
      }
    }
  });
});
