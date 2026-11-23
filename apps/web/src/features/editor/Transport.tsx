import type { MouseEvent } from 'react';
import type { ProjectTrackDoc } from '@outpaly/shared';
import { computeStarts, formatTime, slotDuration, totalDuration } from '@outpaly/editor-core';

interface Props {
  tracks: ProjectTrackDoc[];
  playing: boolean;
  time: number;
  index: number;
  error: string | null;
  onToggle: () => void;
  onSeek: (t: number) => void;
}

/** 재생 버튼 + 곡 길이에 비례한 타임라인. 칸을 누르면 그 지점으로 이동 */
export function Transport({ tracks, playing, time, index, error, onToggle, onSeek }: Props) {
  const total = totalDuration(tracks);
  const starts = computeStarts(tracks);
  const current = tracks[index];
  const disabled = tracks.length === 0;

  function seekWithin(e: MouseEvent<HTMLButtonElement>, i: number) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    onSeek((starts[i] ?? 0) + ratio * slotDuration(tracks[i]!));
  }

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-2.5">
      <div className="flex items-center gap-3.5">
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-label={playing ? '일시정지' : '재생'}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-text text-ink disabled:opacity-40"
        >
          {playing ? (
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
              <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path d="M8 5v14l11-7z" fill="currentColor" />
            </svg>
          )}
        </button>
        <span className="text-[13px] tabular-nums">
          {formatTime(time)}
          <span className="text-text-3"> / {formatTime(total)}</span>
        </span>
        <span className="min-w-0 truncate text-[13px] text-text-2">{current ? `${index + 1}. ${current.displayTitle}` : ''}</span>
        {error && (
          <span role="alert" className="ml-auto text-xs text-warn">
            {error}
          </span>
        )}
      </div>

      {tracks.length > 0 && total > 0 && (
        <div className="relative flex h-7 gap-0.5 overflow-hidden rounded-md">
          {tracks.map((t, i) => (
            <button
              key={t.id}
              type="button"
              onClick={(e) => seekWithin(e, i)}
              aria-label={`${i + 1}번 ${t.displayTitle} (${formatTime(starts[i] ?? 0)}) 로 이동`}
              style={{ flexGrow: slotDuration(t), flexBasis: 0 }}
              className={`min-w-[3px] ${i === index ? 'bg-accent' : i % 2 ? 'bg-[#2C2C36]' : 'bg-[#34343F]'} hover:brightness-125`}
            />
          ))}
          <div aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-white" style={{ left: `${(time / total) * 100}%` }} />
        </div>
      )}
    </div>
  );
}
