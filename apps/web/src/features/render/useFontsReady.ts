import { useEffect, useState } from 'react';
import { FONT_FAMILIES } from '@outpaly/render-core';

// drawFrame 이 쓰는 글꼴·굵기. Canvas 는 글꼴이 로드되기 전에 그리면 기본 글꼴로 그려지므로 미리 불러온다.
const FACES = Object.values(FONT_FAMILIES).flatMap((family) => [`400 32px "${family}"`, `700 32px "${family}"`]);

let ready: Promise<void> | null = null;
function loadAll(): Promise<void> {
  ready ??= Promise.all(FACES.map((f) => document.fonts.load(f)))
    .then(() => undefined)
    .catch(() => undefined); // 글꼴을 못 불러와도 기본 글꼴로 그린다
  return ready;
}

export function useFontsReady(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadAll().then(() => alive && setOk(true));
    return () => {
      alive = false;
    };
  }, []);
  return ok;
}
