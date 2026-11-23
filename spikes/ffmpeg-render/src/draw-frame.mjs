// 한 장의 프레임을 그리는 함수. 브라우저 <canvas> 와 Worker(@napi-rs/canvas) 가 같은 코드를 쓴다.
// (실제 프로젝트에서는 packages/render-core 로 옮긴다)
// 좌표는 모두 1920x1080 기준. 목업 편집기의 cqw 값과 같은 비율을 쓴다 (1cqw = 19.2px).

import { computeStarts, fmtTime } from './timeline.mjs';

const CQW = 19.2;

function drawCover(ctx, img, W, H, fit) {
  const scale = fit === 'contain'
    ? Math.min(W / img.width, H / img.height)
    : Math.max(W / img.width, H / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

function ellipsize(ctx, text, maxWidth) {
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

/**
 * @param ctx      CanvasRenderingContext2D (브라우저든 node 든)
 * @param doc      ProjectDoc
 * @param current  지금 나오는 곡 인덱스 (강조용)
 * @param bgImage  배경 이미지 (없으면 단색)
 * @param fontFamily  등록된 글꼴 이름
 */
export function drawFrame(ctx, doc, current, bgImage, fontFamily) {
  const W = doc.output.width;
  const H = doc.output.height;
  const k = W / 1920; // 720p 등 다른 해상도도 같은 비율로
  const bg = doc.background;

  ctx.save();
  ctx.scale(k, k);
  const w = 1920;
  const h = 1080;

  // 배경
  ctx.fillStyle = bg.color;
  ctx.fillRect(0, 0, w, h);
  if (bgImage) drawCover(ctx, bgImage, w, h, bg.fit);
  if (bg.dim > 0) {
    ctx.fillStyle = `rgba(0,0,0,${bg.dim})`;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.textBaseline = 'top';

  // 제목
  const tl = doc.titleLayer;
  if (tl.visible) {
    ctx.fillStyle = tl.color;
    ctx.font = `700 ${tl.size}px "${fontFamily}"`;
    ctx.fillText(ellipsize(ctx, tl.text, w * 0.5), 5 * CQW, 5 * CQW);
    if (tl.subtitle) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = `400 ${1.6 * CQW}px "${fontFamily}"`;
      ctx.fillText(ellipsize(ctx, tl.subtitle, w * 0.5), 5 * CQW, 5 * CQW + tl.size * 1.05 + 0.8 * CQW);
    }
  }

  // 트랙리스트
  const ll = doc.tracklistLayer;
  if (ll.visible) {
    const starts = computeStarts(doc.tracks);
    const size = ll.size;
    const lineH = size * 1.3 + 0.7 * CQW;
    const boxes = {
      right: { x: w - 5 * CQW - 30 * CQW, y: 14 * CQW, width: 30 * CQW, cols: 1 },
      left: { x: 5 * CQW, y: 18 * CQW, width: 30 * CQW, cols: 1 },
      bottom: { x: 5 * CQW, y: null, width: w - 10 * CQW, cols: 2 }
    };
    const box = boxes[ll.position];
    const rows = Math.ceil(doc.tracks.length / box.cols);
    const y0 = box.y ?? h - 5 * CQW - rows * lineH;
    const colW = (box.width - (box.cols - 1) * 3 * CQW) / box.cols;

    doc.tracks.forEach((t, i) => {
      const col = Math.floor(i / rows);
      const row = i % rows;
      const x = box.x + col * (colW + 3 * CQW);
      const y = y0 + row * lineH;
      const on = ll.highlightCurrent && i === current;
      ctx.fillStyle = on ? '#FFD2BC' : 'rgba(255,255,255,0.86)';
      ctx.font = `${on ? 700 : 400} ${size}px "${fontFamily}"`;
      let tx = x;
      if (ll.showTimestamps) {
        const ts = fmtTime(starts[i]);
        ctx.globalAlpha = 0.85;
        ctx.fillText(ts, x, y);
        ctx.globalAlpha = 1;
        tx = x + ctx.measureText('0:00:00').width * 0.75 + 1.4 * CQW;
      }
      ctx.fillText(ellipsize(ctx, t.displayTitle, colW - (tx - x)), tx, y);
    });
  }

  ctx.restore();
}
