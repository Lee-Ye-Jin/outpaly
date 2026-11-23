import { useEffect, useRef } from 'react';
import type { ProjectDoc } from '@outpaly/shared';
import { drawFrame } from '@outpaly/render-core';
import { useFontsReady } from './useFontsReady.ts';

interface Props {
  doc: ProjectDoc;
  /** 강조할 곡 (-1: 없음) */
  current?: number;
  /** 캔버스 실제 픽셀 너비. 미리보기는 출력 해상도 그대로, 썸네일은 작게 */
  pixelWidth?: number;
  className?: string;
  label: string;
}

/** 서버 렌더러와 같은 drawFrame() 으로 그린다. 그래서 여기서 보이는 그대로 MP4 가 나온다. */
export function ProjectCanvas({ doc, current = -1, pixelWidth, className, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fontsReady = useFontsReady();
  const width = pixelWidth ?? doc.output.width;
  const height = Math.round((width * doc.output.height) / doc.output.width);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx || !fontsReady) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // drawFrame 은 doc.output 크기의 캔버스를 가정하므로, 작은 캔버스에는 비율만큼 미리 줄인다
    ctx.scale(width / doc.output.width, width / doc.output.width);
    drawFrame<HTMLImageElement>(ctx, doc, current, null);
    ctx.restore();
  }, [doc, current, fontsReady, width]);

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      role="img"
      aria-label={label}
      className={className}
      style={{ aspectRatio: `${doc.output.width} / ${doc.output.height}` }}
    />
  );
}
