import type { FontId } from '@outpaly/shared';

/** FontId → 브라우저(Google Fonts)에서 쓰는 글꼴 이름 */
export const FONT_FAMILIES: Record<FontId, string> = {
  'noto-sans-kr': 'Noto Sans KR',
  'noto-serif-kr': 'Noto Serif KR'
};

export type FontWeight = 400 | 700;

/** drawFrame 이 CSS font 문자열을 만들 때 쓰는 이름·굵기 */
export type FontResolver = (font: FontId, weight: FontWeight) => { family: string; weight: number };

/** 브라우저: Google Fonts 가 굵기별 글꼴을 같은 이름으로 제공한다 */
export const browserFonts: FontResolver = (font, weight) => ({ family: FONT_FAMILIES[font], weight });

/**
 * 서버(@napi-rs/canvas): 같은 이름으로 굵기별 파일을 여러 개 등록하면 굵기를 구분하지 못한다
 * (400 이 굵게, 700 이 보통으로 그려짐 — 2026-11-25 확인). 그래서 굵기마다 다른 이름으로 등록하고
 * 그 이름을 굵기 400 으로 부른다. 가짜 굵게(synthetic bold)도 생기지 않는다.
 */
export const serverFontFamily = (font: FontId, weight: FontWeight) => `${FONT_FAMILIES[font]} ${weight}`;
export const serverFonts: FontResolver = (font, weight) => ({ family: serverFontFamily(font, weight), weight: 400 });
