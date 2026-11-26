import { useEffect, useState } from 'react';
import { FONT_CATALOG, fontWeights, type FontId } from '@outpaly/shared';

// 글꼴은 쓰는 것만 그때 불러온다 (12개를 미리 다 받으면 무겁다).
//
// 주의: Google Fonts 는 한글 글꼴을 글자 묶음(unicode-range) 수십 개로 쪼개 두고, 필요한 묶음만 받는다.
// Canvas 는 아직 안 받은 묶음의 글자를 기본 글꼴로 그려 버린다 → "새 플레이리스트" 의 "새" 만 다른 글꼴로 보이는 문제.
// 그래서 실제로 그릴 글자를 넘겨 그 글자가 든 묶음을 받고, 받고 나면 다시 그리게 한다 (version).

const cssLoaded = new Map<FontId, Promise<void>>();

/** Google Fonts CSS 를 한 번 붙이고, 도착할 때까지 기다린다 */
function ensureCss(id: FontId): Promise<void> {
  let p = cssLoaded.get(id);
  if (!p) {
    p = new Promise<void>((resolve) => {
      const f = FONT_CATALOG[id];
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${f.family.replace(/ /g, '+')}:wght@${fontWeights(id)
        .sort((a, b) => a - b)
        .join(';')}&display=swap`;
      link.onload = () => resolve();
      link.onerror = () => resolve(); // 실패하면 기본 글꼴로 그린다
      document.head.appendChild(link);
    });
    cssLoaded.set(id, p);
  }
  return p;
}

/** 이 글꼴로 text 를 그리는 데 필요한 글자 묶음을 모든 굵기에 대해 받는다 */
export async function loadFontFor(id: FontId, text: string): Promise<void> {
  await ensureCss(id);
  const family = FONT_CATALOG[id].family;
  const sample = text || '가A1';
  await Promise.all(fontWeights(id).map((w) => document.fonts.load(`${w} 32px "${family}"`, sample).catch(() => [])));
}

/** 그릴 글자에서 중복을 뺀 것 (같은 글자를 여러 번 넘길 필요 없음) */
const uniqueChars = (s: string) => [...new Set(s)].sort().join('');

/**
 * 글꼴들이 text 를 그릴 준비가 됐는지.
 * ready: 처음 한 번 받을 때까지 false (기본 글꼴로 먼저 그렸다가 바뀌는 깜빡임 방지)
 * version: 새 글자 묶음을 받을 때마다 1 증가 → 다시 그리는 신호
 */
export function useFonts(ids: readonly FontId[], text: string): { ready: boolean; version: number } {
  const idsKey = [...new Set(ids)].sort().join(',');
  const chars = uniqueChars(text);
  const [state, setState] = useState({ ready: false, version: 0 });
  useEffect(() => {
    let alive = true;
    const list = idsKey.split(',').filter(Boolean) as FontId[];
    void Promise.all(list.map((id) => loadFontFor(id, chars))).then(() => {
      if (alive) setState((s) => ({ ready: true, version: s.version + 1 }));
    });
    return () => {
      alive = false;
    };
  }, [idsKey, chars]);
  return state;
}

/** 견본 글자 하나만 보여 줄 때 */
export function useFontsReady(ids: readonly FontId[], text = '가나다라 노을 ABC 123'): boolean {
  return useFonts(ids, text).ready;
}
