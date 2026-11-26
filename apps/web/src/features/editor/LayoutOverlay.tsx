// 미리보기 위에서 제목·트랙리스트를 끌어 옮기는 손잡이.
// - 좌표는 모두 drawFrame 과 같은 1920x1080 기준. 화면에 보이는 크기와의 비율만 곱한다
// - 화면 가운데·가장자리(5% 여백) 근처에서는 맞춤선에 붙는다 (Alt 를 누르고 끌면 붙지 않음)
// - 키보드: 손잡이에 포커스 → 화살표 0.5% (Shift 와 함께 5%)

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ProjectSettings } from '@outpaly/shared';
import type { FrameLayout, Rect } from '@outpaly/render-core';

const W = 1920;
const H = 1080;
const GUIDES_X = [W * 0.05, W * 0.5, W * 0.95];
const GUIDES_Y = [H * 0.05, H * 0.5, H * 0.95];
const SNAP = 14; // 기준 좌표에서 이만큼 가까우면 붙는다
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Update = (recipe: (s: ProjectSettings) => ProjectSettings) => void;
type Kind = 'title' | 'tracklist' | 'tracklist-width';

/** 사각형의 왼쪽·가운데·오른쪽 (또는 위·가운데·아래) 중 맞춤선에 가장 가까운 것에 붙인다 */
function snap(start: number, size: number, guides: number[]): { value: number; guide: number | null } {
  let best: { value: number; guide: number | null; d: number } = { value: start, guide: null, d: SNAP };
  for (const g of guides) {
    for (const offset of [0, size / 2, size]) {
      const d = Math.abs(start + offset - g);
      if (d < best.d) best = { value: g - offset, guide: g, d };
    }
  }
  return { value: best.value, guide: best.guide };
}

/** 제목 덩어리의 왼쪽 위 → 저장할 기준점 (정렬에 따라 왼쪽 끝/가운데/오른쪽 끝) */
function titleAnchor(left: number, w: number, align: ProjectSettings['titleLayer']['align']) {
  return left + (align === 'center' ? w / 2 : align === 'right' ? w : 0);
}

export function LayoutOverlay({ layout, settings, update }: { layout: FrameLayout | null; settings: ProjectSettings; update: Update }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: Kind; sx: number; sy: number; start: Rect; scale: number } | null>(null);
  const frame = useRef<number | null>(null);
  const pending = useRef<((s: ProjectSettings) => ProjectSettings) | null>(null);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [active, setActive] = useState<Kind | null>(null);

  useEffect(() => () => {
    if (frame.current) cancelAnimationFrame(frame.current);
  }, []);

  // 포인터가 움직일 때마다 다시 그리지 않고 화면 갱신 주기(rAF)에 한 번만 반영
  const schedule = (recipe: (s: ProjectSettings) => ProjectSettings) => {
    pending.current = recipe;
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null;
      if (pending.current) update(pending.current);
      pending.current = null;
    });
  };

  /** 사각형을 저장 형식으로 */
  const apply = (kind: Kind, r: Rect) => (s: ProjectSettings): ProjectSettings => {
    if (kind === 'title') {
      return {
        ...s,
        titleLayer: {
          ...s.titleLayer,
          position: { x: clamp(titleAnchor(r.x, r.w, s.titleLayer.align) / W, 0, 1), y: clamp(r.y / H, 0, 1) }
        }
      };
    }
    const x = clamp(r.x / W, 0, 0.95);
    return {
      ...s,
      tracklistLayer: { ...s.tracklistLayer, box: { x, y: clamp(r.y / H, 0, 0.98), width: clamp(r.w / W, 0.1, 1 - x) } }
    };
  };

  function onPointerDown(e: PointerEvent, kind: Kind) {
    const rect = kind === 'title' ? layout?.title : layout?.tracklist;
    const el = ref.current;
    if (!rect || !el || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { kind, sx: e.clientX, sy: e.clientY, start: rect, scale: W / el.getBoundingClientRect().width };
    setActive(kind);
  }

  function onPointerMove(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) * d.scale;
    const dy = (e.clientY - d.sy) * d.scale;
    const free = e.altKey;

    if (d.kind === 'tracklist-width') {
      let right = d.start.x + d.start.w + dx;
      let gx: number | null = null;
      if (!free) {
        const s = snap(right, 0, GUIDES_X);
        right = s.value;
        gx = s.guide;
      }
      setGuides({ x: gx, y: null });
      schedule(apply('tracklist', { ...d.start, w: Math.max(W * 0.1, right - d.start.x) }));
      return;
    }

    let x = d.start.x + dx;
    let y = d.start.y + dy;
    let gx: number | null = null;
    let gy: number | null = null;
    if (!free) {
      const sx = snap(x, d.start.w, GUIDES_X);
      const sy = snap(y, d.start.h, GUIDES_Y);
      x = sx.value;
      y = sy.value;
      gx = sx.guide;
      gy = sy.guide;
    }
    setGuides({ x: gx, y: gy });
    schedule(apply(d.kind, { ...d.start, x, y }));
  }

  function onPointerUp() {
    drag.current = null;
    setActive(null);
    setGuides({ x: null, y: null });
  }

  function onKeyDown(e: KeyboardEvent, kind: Kind) {
    const rect = kind === 'title' ? layout?.title : layout?.tracklist;
    if (!rect) return;
    const step = e.shiftKey ? 0.05 : 0.005;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    if (kind === 'tracklist-width') {
      update(apply('tracklist', { ...rect, w: Math.max(W * 0.1, rect.w + m[0] * step * W) }));
    } else {
      update(apply(kind, { ...rect, x: rect.x + m[0] * step * W, y: rect.y + m[1] * step * H }));
    }
  }

  const pos = (r: Rect) => ({
    left: `${(r.x / W) * 100}%`,
    top: `${(r.y / H) * 100}%`,
    width: `${(r.w / W) * 100}%`,
    height: `${(r.h / H) * 100}%`
  });

  const handle = (kind: 'title' | 'tracklist', r: Rect, label: string) => (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${label} 위치 옮기기 (끌거나 화살표 키, Shift 와 함께 크게)`}
      title={`${label} — 끌어서 옮기기`}
      onPointerDown={(e) => onPointerDown(e, kind)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(e) => onKeyDown(e, kind)}
      className={`pointer-events-auto absolute cursor-move touch-none rounded-[3px] outline-offset-4 hover:outline-2 hover:outline-dashed hover:outline-white/60 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-accent ${
        active === kind ? 'outline-2 outline-solid outline-accent' : ''
      }`}
      style={pos(r)}
    >
      {kind === 'tracklist' && (
        <div
          role="slider"
          tabIndex={0}
          aria-label="트랙리스트 너비 (끌거나 좌우 화살표)"
          aria-valuemin={10}
          aria-valuemax={100}
          aria-valuenow={Math.round((r.w / W) * 100)}
          onPointerDown={(e) => onPointerDown(e, 'tracklist-width')}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={(e) => {
            e.stopPropagation();
            onKeyDown(e, 'tracklist-width');
          }}
          className="absolute top-1/2 -right-2 h-8 w-3 -translate-y-1/2 cursor-ew-resize touch-none rounded-sm border border-white/70 bg-black/50 focus-visible:outline-2 focus-visible:outline-accent"
        />
      )}
    </div>
  );

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 overflow-visible" aria-label="배치 편집">
      {guides.x !== null && <div aria-hidden className="absolute inset-y-0 w-px bg-accent" style={{ left: `${(guides.x / W) * 100}%` }} />}
      {guides.y !== null && <div aria-hidden className="absolute inset-x-0 h-px bg-accent" style={{ top: `${(guides.y / H) * 100}%` }} />}
      {layout?.title && settings.titleLayer.visible && handle('title', layout.title, '제목')}
      {layout?.tracklist && settings.tracklistLayer.visible && handle('tracklist', layout.tracklist, '트랙리스트')}
    </div>
  );
}
