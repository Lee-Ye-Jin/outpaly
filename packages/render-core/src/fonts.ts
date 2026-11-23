import type { FontId } from '@outpaly/shared';

/**
 * FontId → 글꼴 이름. 브라우저는 같은 이름의 웹폰트를, Worker 는 같은 이름으로 등록한 폰트 파일을 쓴다.
 * 이름이 같아야 미리보기와 렌더 결과가 같은 글꼴로 그려진다.
 */
export const FONT_FAMILIES: Record<FontId, string> = {
  'noto-sans-kr': 'Noto Sans KR',
  'noto-serif-kr': 'Noto Serif KR'
};
