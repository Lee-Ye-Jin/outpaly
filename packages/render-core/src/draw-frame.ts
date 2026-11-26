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

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** drawFrame 이 실제로 그린 위치 (1920x1080 좌표). 편집기가 미리보기 위에 끌기 손잡이를 얹을 때 쓴다 */
export interface FrameLayout {
  title: Rect | null;
  tracklist: Rect | null;
}

/** 트랙리스트 줄 높이 */
export const tracklistLineHeight = (ll: ProjectDoc['tracklistLayer']) => (ll.size * 1.3 + 0.7 * CQW) * ll.lineSpacing;

/** 트랙리스트를 놓을 칸. 직접 배치(box)가 있으면 그것을, 없으면 기본 배치(position)를 쓴다 */
export function tracklistBox(ll: ProjectDoc['tracklistLayer'], trackCount: number) {
  const cols = ll.columns ?? (ll.position === 'bottom' ? 2 : 1);
  const rows = Math.ceil(trackCount / cols);
  const lineH = tracklistLineHeight(ll);
  if (ll.box) return { x: ll.box.x * BASE_W, y: ll.box.y * BASE_H, width: ll.box.width * BASE_W, cols, rows, lineH };
  const presets = {
    right: { x: BASE_W - 35 * CQW, y: 14 * CQW, width: 30 * CQW },
    left: { x: 5 * CQW, y: 18 * CQW, width: 30 * CQW },
    bottom: { x: 5 * CQW, y: BASE_H - 5 * CQW - rows * lineH, width: BASE_W - 10 * CQW }
  };
  return { ...presets[ll.position], cols, rows, lineH };
}

/** 정렬에 따라 글자를 시작할 x */
const alignedX = (align: 'left' | 'center' | 'right', anchorOrLeft: number, boxW: number, textW: number) =>
  align === 'center' ? anchorOrLeft + (boxW - textW) / 2 : align === 'right' ? anchorOrLeft + boxW - textW : anchorOrLeft;

/**
 * @param ctx      캔버스 컨텍스트. 캔버스 크기는 doc.output 과 같아야 한다.
 * @param doc      그릴 프로젝트
 * @param current  지금 나오는 곡 인덱스 (강조용, -1 이면 강조 없음)
 * @param bgImage  배경 이미지 (없으면 단색)
 * @param fonts    글꼴 이름 규칙. 브라우저는 기본값, Worker 는 serverFonts
 * @returns        제목·트랙리스트가 그려진 위치
 */
export function drawFrame<I extends FrameImage>(
  ctx: FrameContext<I>,
  doc: ProjectDoc,
  current: number,
  bgImage: I | null,
  fonts: FontResolver = browserFonts
): FrameLayout {
  const font = (id: FontId, weight: FontWeight, size: number) => {
    const f = fonts(id, weight);
    return `${f.weight} ${size}px "${f.family}"`;
  };
  const k = doc.output.width / BASE_W;
  const { background: bg, titleLayer: tl, tracklistLayer: ll } = doc;
  const layout: FrameLayout = { title: null, tracklist: null };

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

  // 제목: position 은 정렬 기준점 (left = 왼쪽 끝, center = 가운데, right = 오른쪽 끝)
  if (tl.visible) {
    const ax = tl.position.x * BASE_W;
    const y = tl.position.y * BASE_H;
    const maxW = BASE_W * 0.9;
    shadow(tl.shadow, tl.size);

    ctx.font = font(tl.font, 700, tl.size);
    const title = ellipsize(ctx, tl.text, maxW);
    const titleW = ctx.measureText(title).width;
    ctx.font = font(tl.font, 400, tl.subtitleSize);
    const sub = tl.subtitle ? ellipsize(ctx, tl.subtitle, maxW) : '';
    const subW = sub ? ctx.measureText(sub).width : 0;
    const subY = y + tl.size * 1.05 + 0.8 * CQW;

    const blockW = Math.max(titleW, subW);
    const left = tl.align === 'center' ? ax - blockW / 2 : tl.align === 'right' ? ax - blockW : ax;

    ctx.fillStyle = tl.color;
    ctx.font = font(tl.font, 700, tl.size);
    ctx.fillText(title, alignedX(tl.align, left, blockW, titleW), y);
    if (sub) {
      ctx.fillStyle = hexToRgba(tl.color, 0.8);
      ctx.font = font(tl.font, 400, tl.subtitleSize);
      ctx.fillText(sub, alignedX(tl.align, left, blockW, subW), subY);
    }
    layout.title = { x: left, y, w: blockW, h: (sub ? subY + tl.subtitleSize * 1.25 : y + tl.size * 1.15) - y };
  }

  // 트랙리스트
  if (ll.visible && doc.tracks.length > 0) {
    const starts = computeStarts(doc.tracks);
    const box = tracklistBox(ll, doc.tracks.length);
    const colGap = 3 * CQW;
    const colW = (box.width - (box.cols - 1) * colGap) / box.cols;
    // 타임스탬프 칸 너비는 항상 보통 굵기로 잰다 (강조된 곡의 제목만 밀리지 않게)
    ctx.font = font(ll.font, 400, ll.size);
    const tsWidth = ll.showTimestamps ? ctx.measureText('0:00:00').width * 0.75 + 1.4 * CQW : 0;
    shadow(ll.shadow, ll.size);

    doc.tracks.forEach((t, i) => {
      const colX = box.x + Math.floor(i / box.rows) * (colW + colGap);
      const y = box.y + (i % box.rows) * box.lineH;
      const on = ll.highlightCurrent && i === current;
      ctx.font = font(ll.font, on ? 700 : 400, ll.size);
      const name = ellipsize(ctx, t.displayTitle, colW - tsWidth);
      const lineW = tsWidth + ctx.measureText(name).width;
      const x = alignedX(ll.align, colX, colW, lineW);
      ctx.fillStyle = on ? HIGHLIGHT_COLOR : hexToRgba(ll.color, 0.86);
      if (ll.showTimestamps) {
        ctx.globalAlpha = 0.85;
        ctx.fillText(formatTime(starts[i] ?? 0), x, y);
        ctx.globalAlpha = 1;
      }
      ctx.fillText(name, x + tsWidth, y);
    });
    layout.tracklist = { x: box.x, y: box.y, w: box.width, h: box.rows * box.lineH };
  }

  ctx.restore();
  return layout;
}
