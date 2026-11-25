import { useEffect, useState } from 'react';

// 같은 이미지를 여러 캔버스(미리보기·썸네일)가 쓰므로 한 번만 불러온다
const cache = new Map<string, Promise<HTMLImageElement>>();

function load(url: string): Promise<HTMLImageElement> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => {
        cache.delete(url); // 다음에 다시 시도할 수 있게
        reject(new Error(`이미지를 불러오지 못했어요: ${url}`));
      };
      img.src = url;
    });
    cache.set(url, p);
  }
  return p;
}

export type ImageState = { status: 'none' } | { status: 'loading' } | { status: 'ready'; image: HTMLImageElement } | { status: 'error' };

/** url 이 null 이면 이미지 없음 */
export function useImage(url: string | null): ImageState {
  const [state, setState] = useState<ImageState>(url ? { status: 'loading' } : { status: 'none' });
  useEffect(() => {
    if (!url) {
      setState({ status: 'none' });
      return;
    }
    let alive = true;
    setState({ status: 'loading' });
    load(url).then(
      (image) => alive && setState({ status: 'ready', image }),
      () => alive && setState({ status: 'error' })
    );
    return () => {
      alive = false;
    };
  }, [url]);
  return state;
}
