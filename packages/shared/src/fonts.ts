// 고를 수 있는 글꼴. 모두 Google Fonts 의 무료 글꼴(SIL OFL)이고,
// 브라우저는 Google Fonts 에서, 렌더 서버는 같은 TTF 파일(@expo-google-fonts)에서 불러온다 → 미리보기와 MP4 가 같다.
//
// regular/bold: drawFrame 이 "보통/굵게"를 요청할 때 실제로 쓸 굵기.
// 굵은 파일이 없는 글꼴은 bold = regular. 브라우저가 가짜 굵게(글자를 억지로 두껍게)를 만들면 서버 결과와 달라지기 때문.

export type FontCategory = '고딕' | '명조' | '손글씨' | '디자인';

export interface FontSpec {
  label: string;
  /** Google Fonts / CSS 글꼴 이름 */
  family: string;
  category: FontCategory;
  regular: number;
  bold: number;
}

export const FONT_CATALOG = {
  'noto-sans-kr': { label: 'Noto Sans KR', family: 'Noto Sans KR', category: '고딕', regular: 400, bold: 700 },
  'nanum-gothic': { label: '나눔고딕', family: 'Nanum Gothic', category: '고딕', regular: 400, bold: 700 },
  'ibm-plex-sans-kr': { label: 'IBM Plex Sans KR', family: 'IBM Plex Sans KR', category: '고딕', regular: 400, bold: 700 },
  'gowun-dodum': { label: '고운돋움', family: 'Gowun Dodum', category: '고딕', regular: 400, bold: 400 },
  'noto-serif-kr': { label: 'Noto Serif KR', family: 'Noto Serif KR', category: '명조', regular: 400, bold: 700 },
  'nanum-myeongjo': { label: '나눔명조', family: 'Nanum Myeongjo', category: '명조', regular: 400, bold: 700 },
  'gowun-batang': { label: '고운바탕', family: 'Gowun Batang', category: '명조', regular: 400, bold: 700 },
  'nanum-pen-script': { label: '나눔손글씨 펜', family: 'Nanum Pen Script', category: '손글씨', regular: 400, bold: 400 },
  'black-han-sans': { label: '검은고딕', family: 'Black Han Sans', category: '디자인', regular: 400, bold: 400 },
  jua: { label: '주아', family: 'Jua', category: '디자인', regular: 400, bold: 400 },
  'do-hyeon': { label: '도현', family: 'Do Hyeon', category: '디자인', regular: 400, bold: 400 },
  sunflower: { label: '해바라기', family: 'Sunflower', category: '디자인', regular: 500, bold: 700 }
} as const satisfies Record<string, FontSpec>;

export type FontId = keyof typeof FONT_CATALOG;
export const FONT_IDS = Object.keys(FONT_CATALOG) as [FontId, ...FontId[]];

/** 이 글꼴에서 실제로 쓰는 굵기들 (브라우저·서버가 불러올 파일) */
export function fontWeights(id: FontId): number[] {
  const f: FontSpec = FONT_CATALOG[id];
  return [...new Set([f.regular, f.bold])];
}
