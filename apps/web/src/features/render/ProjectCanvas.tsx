import { useEffect, useRef } from 'react';
import type { ProjectDoc } from '@outpaly/shared';
import { drawFrame } from '@outpaly/render-core';
import { assetsApi } from '../../services/assets-api.ts';
import { useFontsReady } from './useFontsReady.ts';
import { useImage } from './useImage.ts';

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
  const assetId = doc.background.assetId;
  const bg = useImage(assetId ? assetsApi.fileUrl(assetId) : null);
  const width = pixelWidth ?? doc.output.width;
  const height = Math.round((width * doc.output.height) / doc.output.width);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    // 배경 이미지가 아직 오는 중이면 기다린다 (단색 → 이미지로 깜빡이지 않게). 실패하면 단색으로 그린다
    if (!ctx || !fontsReady || bg.status === 'loading') return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    // drawFrame 은 doc.output 크기의 캔버스를 가정하므로, 작은 캔버스에는 비율만큼 미리 줄인다
    ctx.scale(width / doc.output.width, width / doc.output.width);
    drawFrame<HTMLImageElement>(ctx, doc, current, bg.status === 'ready' ? bg.image : null);
    ctx.restore();
  }, [doc, current, fontsReady, width, height, bg]);

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      role="img"
      aria-label={bg.status === 'error' ? `${label} (배경 이미지를 불러오지 못했어요)` : label}
      className={className}
      style={{ aspectRatio: `${doc.output.width} / ${doc.output.height}` }}
    />
  );
}
