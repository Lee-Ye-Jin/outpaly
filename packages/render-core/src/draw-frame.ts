// 프레임 한 장 그리기. 브라우저 <canvas> 미리보기와 Worker(@napi-rs/canvas) 렌더가 같은 함수를 쓴다.
// spikes/ffmpeg-render/src/draw-frame.mjs 를 옮긴 것. 좌표는 1920x1080 기준 (1cqw = 19.2px).

import { computeStarts, formatTime } from '@outpaly/editor-core';
import type { ProjectDoc } from '@outpaly/shared';
import { browserFonts, type FontResolver, type FontWeight } from './fonts.ts';
import type { FontId } from '@outpaly/shared';

const BASE_W = 1920;
const BASE_H = 1080;
const CQW = BASE_W / 100;
export const HIGHLIGHT_COLOR = '#FFD2BC';

export interface FrameImage {
  width: number;
  height: number;
}

/** CanvasRenderingContext2D 와 @napi-rs/canvas 의 SKRSContext2D 가 모두 만족하는 최소 인터페이스 */
export interface FrameContext<I extends FrameImage = FrameImage> {
  fillStyle: unknown;
  font: string;
  globalAlpha: number;
  textBaseline: string;
  save(): void;
  restore(): void;
  scale(x: number, y: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  drawImage(image: I, dx: number, dy: number, dw: number, dh: number): void;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  /** 있으면 그림자 크기를 실제 픽셀 비율에 맞춘다 (shadowBlur·offset 은 scale() 의 영향을 받지 않음) */
  getTransform?(): { a: number; b: number };
}

/**
 * 배경 이미지를 그릴 위치·크기 (1920x1080 좌표).
 * cover: 화면을 꽉 채우고 넘치는 쪽을 자른다. contain: 이미지 전체가 보인다.
 * zoom 으로 더 키우고, focus 로 화면보다 큰 쪽에서 어디를 보일지 정한다 (0.5 = 가운데).
 */
export function backgroundRect(
  img: FrameImage,
  bg: { fit: 'cover' | 'contain'; zoom: number; focusX: number; focusY: number },
  frame = { width: BASE_W, height: BASE_H }
) {
  const fitScale =
    bg.fit === 'contain'
      ? Math.min(frame.width / img.width, frame.height / img.height)
      : Math.max(frame.width / img.width, frame.height / img.height);
  const w = img.width * fitScale * bg.zoom;
  const h = img.height * fitScale * bg.zoom;
  return { x: (frame.width - w) * bg.focusX, y: (frame.height - h) * bg.focusY, w, h };
}

function ellipsize(ctx: Pick<FrameContext, 'measureText'>, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + '…';
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * @param ctx      캔버스 컨텍스트. 캔버스 크기는 doc.output 과 같아야 한다.
 * @param doc      그릴 프로젝트
 * @param current  지금 나오는 곡 인덱스 (강조용, -1 이면 강조 없음)
 * @param bgImage  배경 이미지 (없으면 단색)
 * @param fonts    글꼴 이름 규칙. 브라우저는 기본값, Worker 는 serverFonts
 */
export function drawFrame<I extends FrameImage>(
  ctx: FrameContext<I>,
  doc: ProjectDoc,
  current: number,
  bgImage: I | null,
  fonts: FontResolver = browserFonts
): void {
  const font = (id: FontId, weight: FontWeight, size: number) => {
    const f = fonts(id, weight);
    return `${f.weight} ${size}px "${f.family}"`;
  };
  const k = doc.output.width / BASE_W;
  const { background: bg, titleLayer: tl, tracklistLayer: ll } = doc;

  ctx.save();
  ctx.scale(k, k);

  // 그림자 크기는 변환(scale)을 따르지 않으므로 실제 픽셀 비율을 곱한다 (썸네일에서 그림자가 번지지 않게)
  const t = ctx.getTransform?.();
  const px = t ? Math.hypot(t.a, t.b) : k;
  const shadow = (on: boolean, size: number) => {
    if (on) {
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = size * 0.18 * px;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = size * 0.04 * px;
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0)';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }
  };

  // 배경
  ctx.fillStyle = bg.color;
  ctx.fillRect(0, 0, BASE_W, BASE_H);
  if (bgImage) {
    const r = backgroundRect(bgImage, bg);
    ctx.drawImage(bgImage, r.x, r.y, r.w, r.h);
  }
  if (bg.dim > 0) {
    ctx.fillStyle = `rgba(0,0,0,${bg.dim})`;
    ctx.fillRect(0, 0, BASE_W, BASE_H);
  }

  ctx.textBaseline = 'top';

  // 제목
  if (tl.visible) {
    const x = tl.position.x * BASE_W;
    const y = tl.position.y * BASE_H;
    shadow(tl.shadow, tl.size);
    ctx.fillStyle = tl.color;
    ctx.font = font(tl.font, 700, tl.size);
    ctx.fillText(ellipsize(ctx, tl.text, BASE_W * 0.5), x, y);
    if (tl.subtitle) {
      ctx.fillStyle = hexToRgba(tl.color, 0.8);
      ctx.font = font(tl.font, 400, 1.6 * CQW);
      ctx.fillText(ellipsize(ctx, tl.subtitle, BASE_W * 0.5), x, y + tl.size * 1.05 + 0.8 * CQW);
    }
  }

  // 트랙리스트
  if (ll.visible && doc.tracks.length > 0) {
    const starts = computeStarts(doc.tracks);
    const lineH = ll.size * 1.3 + 0.7 * CQW;
    const boxes = {
      right: { x: BASE_W - 35 * CQW, y: 14 * CQW as number | null, width: 30 * CQW, cols: 1 },
      left: { x: 5 * CQW, y: 18 * CQW as number | null, width: 30 * CQW, cols: 1 },
      bottom: { x: 5 * CQW, y: null as number | null, width: BASE_W - 10 * CQW, cols: 2 }
    };
    const box = boxes[ll.position];
    const rows = Math.ceil(doc.tracks.length / box.cols);
    const y0 = box.y ?? BASE_H - 5 * CQW - rows * lineH;
    const colW = (box.width - (box.cols - 1) * 3 * CQW) / box.cols;
    // 타임스탬프 칸 너비는 항상 보통 굵기로 잰다 (강조된 곡의 제목만 밀리지 않게)
    ctx.font = font(ll.font, 400, ll.size);
    const tsWidth = ctx.measureText('0:00:00').width * 0.75 + 1.4 * CQW;
    shadow(ll.shadow, ll.size);

    doc.tracks.forEach((t, i) => {
      const x = box.x + Math.floor(i / rows) * (colW + 3 * CQW);
      const y = y0 + (i % rows) * lineH;
      const on = ll.highlightCurrent && i === current;
      ctx.fillStyle = on ? HIGHLIGHT_COLOR : hexToRgba(ll.color, 0.86);
      ctx.font = font(ll.font, on ? 700 : 400, ll.size);
      let tx = x;
      if (ll.showTimestamps) {
        ctx.globalAlpha = 0.85;
        ctx.fillText(formatTime(starts[i] ?? 0), x, y);
        ctx.globalAlpha = 1;
        tx = x + tsWidth;
      }
      ctx.fillText(ellipsize(ctx, t.displayTitle, colW - (tx - x)), tx, y);
    });
  }

  ctx.restore();
}
