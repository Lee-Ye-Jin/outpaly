import type { ProjectSettings, TextAlign } from '@outpaly/shared';
import type { FrameLayout } from '@outpaly/render-core';
import { ColorInput, FontSelect, Range, Section, Segmented, TextInput, Toggle } from './controls.tsx';
import { BackgroundSection } from './BackgroundSection.tsx';

type Update = (recipe: (s: ProjectSettings) => ProjectSettings) => void;

const ALIGN_OPTIONS: { value: TextAlign; label: string }[] = [
  { value: 'left', label: '왼쪽' },
  { value: 'center', label: '가운데' },
  { value: 'right', label: '오른쪽' }
];
const px = (v: number) => `${Math.round(v)}px`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const times = (v: number) => `${v.toFixed(2).replace(/\.?0+$/, '')}배`;

export function DesignPanel({ settings: s, update, layout }: { settings: ProjectSettings; update: Update; layout: FrameLayout | null }) {
  const bg = (patch: Partial<ProjectSettings['background']>) => update((x) => ({ ...x, background: { ...x.background, ...patch } }));
  const title = (patch: Partial<ProjectSettings['titleLayer']>) => update((x) => ({ ...x, titleLayer: { ...x.titleLayer, ...patch } }));
  const list = (patch: Partial<ProjectSettings['tracklistLayer']>) =>
    update((x) => ({ ...x, tracklistLayer: { ...x.tracklistLayer, ...patch } }));

  /** 정렬을 바꿔도 제목이 화면에서 튀지 않게, 지금 그려진 덩어리를 기준으로 기준점을 다시 잡는다 */
  function setTitleAlign(align: TextAlign) {
    const r = layout?.title;
    if (!r) return title({ align });
    const anchor = r.x + (align === 'center' ? r.w / 2 : align === 'right' ? r.w : 0);
    title({ align, position: { x: Math.min(1, Math.max(0, anchor / 1920)), y: s.titleLayer.position.y } });
  }

  const ll = s.tracklistLayer;
  const custom = ll.box !== null;

  return (
    <div className="flex flex-col gap-5 p-5">
      <Section title="출력">
        <Segmented
          label="해상도"
          value={s.output.width === 1920 ? '1080' : '720'}
          options={[
            { value: '1080', label: '1080p' },
            { value: '720', label: '720p' }
          ]}
          onChange={(v) =>
            update((x) => ({
              ...x,
              output: v === '1080' ? { width: 1920, height: 1080, fps: 30 } : { width: 1280, height: 720, fps: 30 }
            }))
          }
        />
        <p className="text-xs leading-relaxed text-text-3">
          {s.output.width === 1920 ? '1920×1080 · 유튜브 권장.' : '1280×720 · 렌더가 조금 빨라요.'} 구도는 같고 선명도만 달라요. 미리보기는
          화면에 맞춰 보여 줘서 차이가 보이지 않아요.
        </p>
      </Section>

      <BackgroundSection bg={s.background} onChange={bg} />

      <Section title="제목">
        <Toggle label="화면에 제목 표시" checked={s.titleLayer.visible} onChange={(visible) => title({ visible })} />
        <TextInput label="영상 제목" value={s.titleLayer.text} maxLength={120} onChange={(text) => title({ text })} />
        <TextInput
          label="부제"
          value={s.titleLayer.subtitle}
          maxLength={200}
          placeholder="예: 공부할 때 틀어두는 플레이리스트"
          onChange={(subtitle) => title({ subtitle })}
        />
        <FontSelect label="글꼴" value={s.titleLayer.font} onChange={(font) => title({ font })} />
        <Range label="크기" value={s.titleLayer.size} min={24} max={200} step={2} format={px} onChange={(size) => title({ size })} />
        <Range
          label="부제 크기"
          value={s.titleLayer.subtitleSize}
          min={12}
          max={100}
          step={1}
          format={px}
          onChange={(subtitleSize) => title({ subtitleSize })}
        />
        <Segmented label="정렬" value={s.titleLayer.align} options={ALIGN_OPTIONS} onChange={setTitleAlign} />
        <ColorInput label="색" value={s.titleLayer.color} onChange={(color) => title({ color })} />
        <Toggle label="글자 그림자 (밝은 배경에서 잘 보이게)" checked={s.titleLayer.shadow} onChange={(shadow) => title({ shadow })} />
        <button
          type="button"
          onClick={() => title({ position: { x: 0.05, y: 0.09 }, align: 'left' })}
          className="min-h-9 self-start rounded-lg px-1 text-[13px] text-text-2 hover:text-text"
        >
          제목 위치 처음으로
        </button>
      </Section>

      <Section title="트랙리스트">
        <Toggle label="화면에 트랙리스트 표시" checked={ll.visible} onChange={(visible) => list({ visible })} />
        <Segmented
          label={custom ? '기본 배치 (지금은 직접 배치 중)' : '기본 배치'}
          value={custom ? null : ll.position}
          options={[
            { value: 'left', label: '왼쪽' },
            { value: 'right', label: '오른쪽' },
            { value: 'bottom', label: '아래' }
          ]}
          // 기본 배치를 고르면 직접 배치·열 개수를 지우고 그 배치의 기본값으로
          onChange={(position) => list({ position, box: null, columns: null })}
        />
        {custom && (
          <Range
            label="너비"
            value={ll.box!.width}
            min={0.1}
            max={Math.max(0.1, 1 - ll.box!.x)}
            step={0.01}
            format={pct}
            onChange={(width) => list({ box: { ...ll.box!, width } })}
          />
        )}
        <Segmented
          label="열 개수"
          value={ll.columns === null ? 'auto' : String(ll.columns)}
          options={[
            { value: 'auto', label: '자동' },
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3', label: '3' }
          ]}
          onChange={(v) => list({ columns: v === 'auto' ? null : Number(v) })}
        />
        <Range label="줄 간격" value={ll.lineSpacing} min={0.6} max={2.5} step={0.05} format={times} onChange={(lineSpacing) => list({ lineSpacing })} />
        <Segmented label="정렬" value={ll.align} options={ALIGN_OPTIONS} onChange={(align) => list({ align })} />
        <Toggle label="지금 나오는 곡 강조" checked={ll.highlightCurrent} onChange={(highlightCurrent) => list({ highlightCurrent })} />
        <Toggle label="곡 시작 시각 표시" checked={ll.showTimestamps} onChange={(showTimestamps) => list({ showTimestamps })} />
        <FontSelect label="글꼴" value={ll.font} onChange={(font) => list({ font })} />
        <Range label="크기" value={ll.size} min={14} max={64} step={1} format={px} onChange={(size) => list({ size })} />
        <ColorInput label="색" value={ll.color} onChange={(color) => list({ color })} />
        <Toggle label="글자 그림자" checked={ll.shadow} onChange={(shadow) => list({ shadow })} />
      </Section>
    </div>
  );
}
