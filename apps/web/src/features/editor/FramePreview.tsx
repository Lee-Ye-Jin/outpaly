import { useEffect, useRef, useState } from 'react';
import { createDefaultSettings, type ProjectDoc } from '@outpaly/shared';
import { formatTime, totalDuration } from '@outpaly/editor-core';
import { drawFrame, FONT_FAMILIES } from '@outpaly/render-core';

// Phase 1 확인용 샘플. Phase 3~4 에서 실제 프로젝트 데이터로 바뀐다.
const settings = createDefaultSettings('Late Night Lo-fi');
settings.titleLayer.subtitle = '공부할 때 틀어두는 플레이리스트';
settings.background.color = '#3A2E2A';
const SAMPLE: ProjectDoc = {
  ...settings,
  title: 'Late Night Lo-fi Vol.1',
  tracks: [
    ['Morning Static', 214],
    ['Window Seat', 187],
    ['비 오는 오후', 242],
    ['Paper Lanterns', 201],
    ['Slow Commute', 228]
  ].map(([title, dur], i) => ({
    id: `pt${i}`,
    trackId: `t${i}`,
    displayTitle: title as string,
    displayArtist: 'Sample Artist',
    sourceDuration: dur as number,
    trimStart: 0,
    trimEnd: null,
    gain: 0,
    gapAfter: 0
  }))
};

/** 서버 렌더러와 같은 drawFrame() 으로 그린다. 그래서 여기서 보이는 그대로 MP4 가 나온다. */
export function FramePreview() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [current, setCurrent] = useState(2);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    const family = FONT_FAMILIES['noto-sans-kr'];
    Promise.all([document.fonts.load(`400 27px "${family}"`), document.fonts.load(`700 84px "${family}"`)])
      .catch(() => undefined)
      .finally(() => setFontsReady(true));
  }, []);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx && fontsReady) drawFrame<HTMLImageElement>(ctx, SAMPLE, current, null);
  }, [current, fontsReady]);

  return (
    <section className="rounded-2xl border border-line bg-panel p-6" aria-labelledby="preview-title">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id="preview-title" className="text-base font-semibold">
          렌더러 미리보기
        </h2>
        <p className="text-sm text-text-3">
          @outpaly/render-core 의 drawFrame() · 서버 렌더러와 같은 코드
        </p>
      </div>
      <canvas
        ref={ref}
        width={SAMPLE.output.width}
        height={SAMPLE.output.height}
        className="aspect-video w-full rounded-lg bg-panel-2"
        role="img"
        aria-label={`${SAMPLE.title} 미리보기, ${current + 1}번 곡 강조`}
      />
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="강조할 곡">
        {SAMPLE.tracks.map((t, i) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={i === current}
            onClick={() => setCurrent(i)}
            className={`min-h-10 rounded-lg px-3 text-sm ${
              i === current ? 'bg-accent font-semibold text-accent-ink' : 'border border-line-strong hover:bg-panel-2'
            }`}
          >
            {i + 1}. {t.displayTitle}
          </button>
        ))}
        <span className="ml-auto self-center text-sm text-text-2 tabular-nums">
          전체 {formatTime(totalDuration(SAMPLE.tracks))}
        </span>
      </div>
    </section>
  );
}
