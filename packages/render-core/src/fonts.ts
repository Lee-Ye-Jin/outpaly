import { FONT_CATALOG, type FontId } from '@outpaly/shared';

/** FontId → 브라우저(Google Fonts)에서 쓰는 글꼴 이름 */
export const FONT_FAMILIES = Object.fromEntries(Object.entries(FONT_CATALOG).map(([id, f]) => [id, f.family])) as Record<FontId, string>;

/** drawFrame 이 요청하는 굵기: 보통(400) / 굵게(700) */
export type FontWeight = 400 | 700;

/** drawFrame 이 CSS font 문자열을 만들 때 쓰는 이름·굵기 */
export type FontResolver = (font: FontId, weight: FontWeight) => { family: string; weight: number };

/** 이 글꼴에서 "보통/굵게"에 실제로 쓰는 굵기. 굵은 파일이 없으면 보통 굵기 (가짜 굵게 방지) */
export function actualWeight(font: FontId, weight: FontWeight): number {
  const f = FONT_CATALOG[font];
  return weight === 700 ? f.bold : f.regular;
}

/** 브라우저: Google Fonts 가 굵기별 글꼴을 같은 이름으로 제공한다 */
export const browserFonts: FontResolver = (font, weight) => ({ family: FONT_FAMILIES[font], weight: actualWeight(font, weight) });

/**
 * 서버(@napi-rs/canvas): 같은 이름으로 굵기별 파일을 여러 개 등록하면 굵기를 구분하지 못한다
 * (400 이 굵게, 700 이 보통으로 그려짐 — 2026-11-25 확인). 그래서 굵기마다 다른 이름으로 등록하고
 * 그 이름을 굵기 400 으로 부른다. 가짜 굵게(synthetic bold)도 생기지 않는다.
 */
export const serverFontFamily = (font: FontId, actual: number) => `${FONT_FAMILIES[font]} ${actual}`;
export const serverFonts: FontResolver = (font, weight) => ({ family: serverFontFamily(font, actualWeight(font, weight)), weight: 400 });
