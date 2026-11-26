import { useEffect, useRef, useState } from 'react';

/** 모니터 픽셀 / CSS 픽셀 (Windows 화면 배율 125% → 1.25). 창을 다른 모니터로 옮기면 바뀐다 */
export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const update = () => setDpr(window.devicePixelRatio || 1);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [dpr]);
  return dpr;
}

/** 실제 크기 보기 여부 (이 브라우저에만 기억) */
export function useActualSizePref(): [boolean, (v: boolean) => void] {
  const KEY = 'outpaly.preview.actualSize';
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  const set = (v: boolean) => {
    setOn(v);
    try {
      localStorage.setItem(KEY, v ? '1' : '0');
    } catch {
      // 저장 못 해도 지금 화면에서는 바뀐다
    }
  };
  return [on, set];
}

/**
 * 미리보기를 몇 %로 보고 있는지: 화면에 보이는 모니터 픽셀 수 / 영상 픽셀 수.
 * ref 를 미리보기 캔버스를 감싼 요소에 붙인다.
 */
export function usePreviewZoom(outputWidth: number, dpr: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setShown(entry?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pct = shown > 0 ? Math.round(((shown * dpr) / outputWidth) * 100) : 0;
  return { ref, pct };
}
