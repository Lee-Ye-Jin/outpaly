import { useEffect, useState } from 'react';
import { MIN_TRIMMED_SECONDS, type ProjectTrackDto, type UpdateProjectTrackInput } from '@outpaly/shared';
import { formatTime, formatTimePrecise, parseTimeInput, playedDuration } from '@outpaly/editor-core';
import { Range, Section, TextInput } from './controls.tsx';

interface Props {
  pt: ProjectTrackDto;
  index: number;
  onChange: (patch: UpdateProjectTrackInput) => void;
  onRemove: () => void;
  onPreview: () => void;
}

/** 시간 입력: 입력하는 동안은 글자 그대로 두고, 칸을 벗어날 때(blur·Enter) 해석해서 반영 */
function TimeField(props: { label: string; seconds: number; onCommit: (s: number) => string | null }) {
  const [text, setText] = useState(formatTimePrecise(props.seconds));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(formatTimePrecise(props.seconds)), [props.seconds]);

  function commit() {
    const s = parseTimeInput(text);
    if (s === null) {
      setError('예: 1:05.5');
      return;
    }
    const err = props.onCommit(s);
    setError(err);
    if (err) return;
    setText(formatTimePrecise(s));
  }

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label className="flex flex-col gap-1.5">
        {props.label}
        <input
          value={text}
          inputMode="decimal"
          aria-invalid={error ? true : undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          className="min-h-10 rounded-lg border border-line-strong bg-ink px-3 text-sm tabular-nums outline-none focus:border-accent"
        />
      </label>
      {error && <p className="text-xs text-warn">{error}</p>}
    </div>
  );
}

export function TrackSettingsPanel({ pt, index, onChange, onRemove, onPreview }: Props) {
  const duration = pt.track.duration;
  const end = pt.trimEnd ?? duration;
  const played = playedDuration({ sourceDuration: duration, trimStart: pt.trimStart, trimEnd: pt.trimEnd, gapAfter: 0 });

  const commitStart = (s: number) => {
    if (end - s < MIN_TRIMMED_SECONDS) return `끝 지점보다 ${MIN_TRIMMED_SECONDS}초 이상 앞이어야 해요.`;
    onChange({ trimStart: s });
    return null;
  };
  const commitEnd = (s: number) => {
    if (s > duration + 0.001) return `곡 길이(${formatTimePrecise(duration)})보다 길 수 없어요.`;
    if (s - pt.trimStart < MIN_TRIMMED_SECONDS) return `시작 지점보다 ${MIN_TRIMMED_SECONDS}초 이상 뒤여야 해요.`;
    onChange({ trimEnd: Math.abs(s - duration) < 0.05 ? null : s });
    return null;
  };

  return (
    <div className="flex flex-col gap-5 p-5">
      <p className="text-xs text-text-2">
        {index + 1}번 곡 · 원본 {formatTime(duration)} · 영상에서 {formatTime(played)}
      </p>

      <Section title="표시 정보">
        <TextInput
          label="표시 제목"
          value={pt.displayTitle ?? pt.track.title}
          maxLength={200}
          onChange={(v) => onChange({ displayTitle: v.trim() === pt.track.title ? null : v })}
        />
        <TextInput
          label="아티스트"
          value={pt.displayArtist ?? pt.track.artist ?? ''}
          maxLength={200}
          placeholder="없음"
          onChange={(v) => onChange({ displayArtist: v.trim() === (pt.track.artist ?? '') ? null : v })}
        />
      </Section>

      <Section title="구간">
        <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2.5">
          <TimeField label="시작" seconds={pt.trimStart} onCommit={commitStart} />
          <TimeField label="끝" seconds={end} onCommit={commitEnd} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onPreview} className="min-h-9 rounded-lg border border-line-strong px-3 text-sm hover:bg-panel-2">
            이 곡부터 듣기
          </button>
          {(pt.trimStart > 0 || pt.trimEnd !== null) && (
            <button type="button" onClick={() => onChange({ trimStart: 0, trimEnd: null })} className="min-h-9 rounded-lg px-3 text-sm text-text-2 hover:bg-panel-2">
              구간 초기화
            </button>
          )}
        </div>
      </Section>

      <Section title="소리">
        <Range
          label="볼륨"
          value={pt.gain}
          min={-12}
          max={6}
          step={1}
          format={(v) => `${v > 0 ? '+' : ''}${v} dB`}
          onChange={(gain) => onChange({ gain })}
        />
        <Range
          label="곡 뒤 무음"
          value={pt.gapAfter}
          min={0}
          max={10}
          step={0.5}
          format={(v) => `${v}초`}
          onChange={(gapAfter) => onChange({ gapAfter })}
        />
        {pt.gain > 0 && <p className="text-xs text-text-3">미리듣기에서는 원래 크기까지만 커지고, MP4 에는 정확히 반영돼요.</p>}
      </Section>

      <button type="button" onClick={onRemove} className="min-h-10 rounded-lg border border-[#4A2A22] text-sm text-[#FF9B85] hover:bg-[#4A2A22]/30">
        이 곡을 플레이리스트에서 빼기
      </button>
      <p className="-mt-5 text-xs text-text-3">원본 파일은 내 음악에 남아요.</p>
    </div>
  );
}
