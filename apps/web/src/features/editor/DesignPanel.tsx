import type { FontId, ProjectSettings } from '@outpaly/shared';
import { ColorInput, Range, Section, Segmented, Select, TextInput, Toggle } from './controls.tsx';
import { BackgroundSection } from './BackgroundSection.tsx';

type Update = (recipe: (s: ProjectSettings) => ProjectSettings) => void;

const FONT_OPTIONS: { value: FontId; label: string }[] = [
  { value: 'noto-sans-kr', label: 'Noto Sans KR (고딕)' },
  { value: 'noto-serif-kr', label: 'Noto Serif KR (명조)' }
];
const px = (v: number) => `${v}px`;

export function DesignPanel({ settings: s, update }: { settings: ProjectSettings; update: Update }) {
  const bg = (patch: Partial<ProjectSettings['background']>) => update((x) => ({ ...x, background: { ...x.background, ...patch } }));
  const title = (patch: Partial<ProjectSettings['titleLayer']>) => update((x) => ({ ...x, titleLayer: { ...x.titleLayer, ...patch } }));
  const list = (patch: Partial<ProjectSettings['tracklistLayer']>) =>
    update((x) => ({ ...x, tracklistLayer: { ...x.tracklistLayer, ...patch } }));

  return (
    <div className="flex flex-col gap-7 p-5">
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
        <Select label="글꼴" value={s.titleLayer.font} options={FONT_OPTIONS} onChange={(font) => title({ font })} />
        <Range label="크기" value={s.titleLayer.size} min={24} max={200} step={2} format={px} onChange={(size) => title({ size })} />
        <ColorInput label="색" value={s.titleLayer.color} onChange={(color) => title({ color })} />
        <Toggle label="글자 그림자 (밝은 배경에서 잘 보이게)" checked={s.titleLayer.shadow} onChange={(shadow) => title({ shadow })} />
      </Section>

      <Section title="트랙리스트">
        <Toggle label="화면에 트랙리스트 표시" checked={s.tracklistLayer.visible} onChange={(visible) => list({ visible })} />
        <Segmented
          label="위치"
          value={s.tracklistLayer.position}
          options={[
            { value: 'left', label: '왼쪽' },
            { value: 'right', label: '오른쪽' },
            { value: 'bottom', label: '아래' }
          ]}
          onChange={(position) => list({ position })}
        />
        <Toggle label="지금 나오는 곡 강조" checked={s.tracklistLayer.highlightCurrent} onChange={(highlightCurrent) => list({ highlightCurrent })} />
        <Toggle label="곡 시작 시각 표시" checked={s.tracklistLayer.showTimestamps} onChange={(showTimestamps) => list({ showTimestamps })} />
        <Select label="글꼴" value={s.tracklistLayer.font} options={FONT_OPTIONS} onChange={(font) => list({ font })} />
        <Range label="크기" value={s.tracklistLayer.size} min={14} max={64} step={1} format={px} onChange={(size) => list({ size })} />
        <ColorInput label="색" value={s.tracklistLayer.color} onChange={(color) => list({ color })} />
        <Toggle label="글자 그림자" checked={s.tracklistLayer.shadow} onChange={(shadow) => list({ shadow })} />
      </Section>
    </div>
  );
}
