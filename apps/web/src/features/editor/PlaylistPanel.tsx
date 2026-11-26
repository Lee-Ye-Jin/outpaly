import { useRef, useState, type DragEvent } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from './dnd-modifiers.ts';
import { AUDIO_ACCEPT_ATTR, MAX_TRACKS_PER_PROJECT, type ProjectTrackDoc } from '@outpaly/shared';
import { formatTime, playedDuration, totalDuration } from '@outpaly/editor-core';
import type { UploadItem } from './useUploads.ts';

interface Props {
  tracks: ProjectTrackDoc[];
  selectedId: string | null;
  playingIndex: number;
  uploads: UploadItem[];
  onSelect: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onFiles: (files: File[]) => void;
  onDismissUpload: (id: string) => void;
  onOpenLibrary: () => void;
}

export function PlaylistPanel(p: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const full = p.tracks.length >= MAX_TRACKS_PER_PROJECT;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = p.tracks.map((t) => t.id);
    p.onReorder(arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!full) p.onFiles([...e.dataTransfer.files]);
  }

  return (
    <section aria-label="플레이리스트" className="flex min-w-0 flex-[1_1_280px] flex-col border-r border-line bg-[#121216] lg:min-h-0 lg:max-w-[340px]">
      <div className="flex items-baseline justify-between px-5 pt-5 pb-3">
        <h2 className="text-[15px] font-semibold">플레이리스트</h2>
        <span className="text-xs text-text-2">{p.tracks.length}곡</span>
      </div>

      <div className="mx-4 flex flex-col gap-2">
        <button
          type="button"
          disabled={full}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex items-center gap-3 rounded-xl border-[1.5px] border-dashed p-4 text-left text-[#C9C8CF] transition disabled:cursor-not-allowed disabled:opacity-50 ${
            dragOver ? 'border-accent bg-accent/10' : 'border-line-strong bg-[#16161B] hover:border-text-3'
          }`}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF8A5C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
          </svg>
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium">{full ? `최대 ${MAX_TRACKS_PER_PROJECT}곡이에요` : '음악 파일을 끌어다 놓거나 클릭'}</span>
            <span className="text-xs text-text-3">MP3 · WAV · 곡당 최대 100MB</span>
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={AUDIO_ACCEPT_ATTR}
          multiple
          hidden
          onChange={(e) => {
            p.onFiles([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={p.onOpenLibrary}
          disabled={full}
          className="min-h-10 rounded-lg border border-line-strong text-sm hover:bg-panel-2 disabled:opacity-50"
        >
          내 음악에서 추가
        </button>
      </div>

      {p.uploads.length > 0 && (
        <ul aria-label="업로드" className="mx-4 mt-3 flex flex-col gap-1.5">
          {p.uploads.map((u) => (
            <li key={u.id} className="rounded-lg bg-panel-2 px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{u.name}</span>
                <span className={u.status === 'error' ? 'text-warn' : 'text-text-2'}>
                  {u.status === 'waiting' && '대기'}
                  {u.status === 'uploading' && `${Math.round(u.progress * 100)}%`}
                  {u.status === 'processing' && '확인 중…'}
                  {u.status === 'done' && '완료'}
                  {u.status === 'error' && '실패'}
                </span>
                {u.status === 'error' && (
                  <button type="button" aria-label={`${u.name} 오류 닫기`} onClick={() => p.onDismissUpload(u.id)} className="px-1 text-text-2 hover:text-text">
                    ✕
                  </button>
                )}
              </div>
              {(u.status === 'uploading' || u.status === 'processing') && (
                <div className="mt-1.5 h-1 overflow-hidden rounded bg-line" role="progressbar" aria-label={`${u.name} 업로드`} aria-valuenow={Math.round(u.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-accent transition-[width]" style={{ width: `${u.progress * 100}%` }} />
                </div>
              )}
              {u.error && <p className="mt-1 text-warn">{u.error}</p>}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2.5">
        {p.tracks.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-text-3">아직 곡이 없어요.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
            <SortableContext items={p.tracks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <ol className="flex flex-col gap-0.5" aria-label="곡 목록 (끌어서 순서 바꾸기)">
                {p.tracks.map((t, i) => (
                  <SortableTrack
                    key={t.id}
                    track={t}
                    index={i}
                    selected={t.id === p.selectedId}
                    playing={i === p.playingIndex}
                    onSelect={() => p.onSelect(t.id)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="flex justify-between border-t border-line px-5 py-3.5 text-sm">
        <span className="text-text-2">전체 길이</span>
        <span className="font-semibold tabular-nums">{formatTime(totalDuration(p.tracks))}</span>
      </div>
    </section>
  );
}

function SortableTrack(p: { track: ProjectTrackDoc; index: number; selected: boolean; playing: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: p.track.id });
  const t = p.track;
  const trimmed = t.trimStart > 0 || t.trimEnd !== null;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 rounded-[10px] border ${isDragging ? 'relative z-10 shadow-lg' : ''} ${
        p.selected ? 'border-[#4A3328] bg-[#22222B]' : 'border-transparent hover:bg-[#1A1A21]'
      }`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`${p.index + 1}번 ${t.displayTitle} 순서 바꾸기`}
        className="flex h-12 w-7 shrink-0 cursor-grab items-center justify-center touch-none active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden>
          <g fill="#5A5A66">
            <circle cx="3" cy="3" r="1.4" /><circle cx="9" cy="3" r="1.4" /><circle cx="3" cy="8" r="1.4" />
            <circle cx="9" cy="8" r="1.4" /><circle cx="3" cy="13" r="1.4" /><circle cx="9" cy="13" r="1.4" />
          </g>
        </svg>
      </button>
      <button type="button" onClick={p.onSelect} aria-pressed={p.selected} className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 py-1.5 pr-2.5 text-left">
        <span className={`w-5 shrink-0 text-xs tabular-nums ${p.selected || p.playing ? 'text-accent' : 'text-text-3'}`}>
          {p.playing ? '▶' : String(p.index + 1).padStart(2, '0')}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-medium">{t.displayTitle}</span>
          <span className="truncate text-xs text-text-3">{t.displayArtist || '—'}</span>
        </span>
        <span className="flex flex-col items-end text-xs tabular-nums">
          <span className="text-text-2">{formatTime(playedDuration(t))}</span>
          {trimmed && <span className="text-[11px] text-text-3">구간</span>}
        </span>
      </button>
    </li>
  );
}
