// 서버 렌더링용 글꼴 등록. 브라우저 미리보기(Google Fonts)와 같은 TTF 파일(@expo-google-fonts 패키지).
// 가변(VF) 폰트는 굵기 지정이 제대로 되지 않아 쓰지 않는다 (render-core/fonts.ts 참고).

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { GlobalFonts } from '@napi-rs/canvas';
import { FONT_IDS, fontWeights, type FontId } from '@outpaly/shared';
import { serverFontFamily } from '@outpaly/render-core';

const require = createRequire(import.meta.url);

/** @expo-google-fonts 의 파일 이름 앞부분 (예: NanumGothic_700Bold.ttf) */
const FILE_PREFIX: Record<FontId, string> = {
  'noto-sans-kr': 'NotoSansKR',
  'noto-serif-kr': 'NotoSerifKR',
  'nanum-gothic': 'NanumGothic',
  'nanum-myeongjo': 'NanumMyeongjo',
  'nanum-pen-script': 'NanumPenScript',
  'gowun-dodum': 'GowunDodum',
  'gowun-batang': 'GowunBatang',
  'ibm-plex-sans-kr': 'IBMPlexSansKR',
  'black-han-sans': 'BlackHanSans',
  jua: 'Jua',
  'do-hyeon': 'DoHyeon',
  sunflower: 'Sunflower'
};

const WEIGHT_NAME: Record<number, string> = { 300: 'Light', 400: 'Regular', 500: 'Medium', 700: 'Bold' };

/** 글꼴 하나·굵기 하나의 TTF 경로 */
export function fontFile(id: FontId, weight: number, fontDir?: string): string {
  const dirName = `${weight}${WEIGHT_NAME[weight]}`;
  const file = `${FILE_PREFIX[id]}_${dirName}.ttf`;
  if (fontDir) return path.join(fontDir, file);
  const pkgDir = path.dirname(require.resolve(`@expo-google-fonts/${id}/package.json`));
  return path.join(pkgDir, dirName, file);
}

let registered = false;

/** 한 번만 등록. 파일이 하나라도 없으면 예외 (기본 글꼴로 몰래 그리지 않는다) */
export function registerFonts(fontDir?: string) {
  if (registered) return;
  for (const id of FONT_IDS) {
    for (const weight of fontWeights(id)) {
      const file = fontFile(id, weight, fontDir);
      if (!existsSync(file)) throw new Error(`글꼴 파일이 없어요: ${file}`);
      if (!GlobalFonts.registerFromPath(file, serverFontFamily(id, weight))) {
        throw new Error(`글꼴을 등록하지 못했어요: ${file}`);
      }
    }
  }
  registered = true;
}
