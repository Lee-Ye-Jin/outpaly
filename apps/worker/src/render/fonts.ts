// 서버 렌더링용 글꼴 등록. 브라우저 미리보기(Google Fonts)와 같은 Noto Sans KR / Noto Serif KR 고정 굵기 파일.
// 가변(VF) 폰트는 굵기 지정이 제대로 되지 않아 쓰지 않는다 (render-core/fonts.ts 참고).

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { GlobalFonts } from '@napi-rs/canvas';
import { FONT_IDS, type FontId } from '@outpaly/shared';
import { serverFontFamily, type FontWeight } from '@outpaly/render-core';

const require = createRequire(import.meta.url);

const FILES: Record<FontId, { pkg: string; files: Record<FontWeight, string> }> = {
  'noto-sans-kr': {
    pkg: '@expo-google-fonts/noto-sans-kr',
    files: { 400: '400Regular/NotoSansKR_400Regular.ttf', 700: '700Bold/NotoSansKR_700Bold.ttf' }
  },
  'noto-serif-kr': {
    pkg: '@expo-google-fonts/noto-serif-kr',
    files: { 400: '400Regular/NotoSerifKR_400Regular.ttf', 700: '700Bold/NotoSerifKR_700Bold.ttf' }
  }
};

let registered = false;

/** 한 번만 등록. 파일이 하나라도 없으면 예외 (기본 글꼴로 몰래 그리지 않는다) */
export function registerFonts(fontDir?: string) {
  if (registered) return;
  for (const id of FONT_IDS) {
    const spec = FILES[id];
    const base = fontDir ?? path.dirname(require.resolve(`${spec.pkg}/package.json`));
    for (const weight of [400, 700] as const) {
      const file = path.join(base, fontDir ? path.basename(spec.files[weight]) : spec.files[weight]);
      if (!existsSync(file)) throw new Error(`글꼴 파일이 없어요: ${file}`);
      if (!GlobalFonts.registerFromPath(file, serverFontFamily(id, weight))) {
        throw new Error(`글꼴을 등록하지 못했어요: ${file}`);
      }
    }
  }
  registered = true;
}
