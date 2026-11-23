import { useEffect, useId, useRef, useState } from 'react';
import type { TrackDto } from '@outpaly/shared';
import { formatTime } from '@outpaly/editor-core';
import { ApiRequestError } from '../../services/api.ts';
import { tracksApi } from '../../services/tracks-api.ts';

const sizeMb = (b: number) => `${(b / 1024 / 1024).toFixed(1)}MB`;

/** 내 음악(이미 올린 곡)에서 골라 프로젝트에 추가. 쓰지 않는 곡은 여기서 지울 수 있다 */
export function LibraryDialog(props: { open: boolean; onClose: () => void; onAdd: (trackIds: string[]) => void; maxAdd: number }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [tracks, setTracks] = useState<TrackDto[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open && !d.open) d.showModal();
    if (!props.open && d.open) d.close();
    if (!props.open) return;
    setPicked([]);
    setError(null);
    setTracks(null);
    const ctrl = new AbortController();
    tracksApi
      .list(ctrl.signal)
      .then((r) => setTracks(r.tracks))
      .catch((e: unknown) => !ctrl.signal.aborted && setError(e instanceof ApiRequestError ? e.message : '목록을 불러오지 못했어요.'));
    return () => ctrl.abort();
  }, [props.open]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function remove(t: TrackDto) {
    setError(null);
    try {
      await tracksApi.remove(t.id);
      setTracks((prev) => prev?.filter((x) => x.id !== t.id) ?? null);
      setPicked((p) => p.filter((x) => x !== t.id));
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : '삭제하지 못했어요.');
    }
  }

  const tooMany = picked.length > props.maxAdd;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={props.onClose}
      onCancel={(e) => {
        e.preventDefault();
        props.onClose();
      }}
      className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-2xl border border-line bg-panel p-0 text-text backdrop:bg-black/60"
    >
      {props.open && (
        <div className="flex max-h-[80vh] flex-col gap-4 p-6">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              내 음악에서 추가
            </h2>
            <p className="mt-1 text-sm text-text-2">고른 순서대로 플레이리스트 끝에 추가돼요.</p>
          </div>
          {error && (
            <p role="alert" className="text-sm text-warn">
              {error}
            </p>
          )}
          <div className="min-h-24 overflow-y-auto">
            {tracks === null && !error && <p className="text-sm text-text-3">불러오는 중…</p>}
            {tracks?.length === 0 && <p className="text-sm text-text-3">아직 올린 음악이 없어요.</p>}
            <ul className="flex flex-col gap-1">
              {tracks?.map((t) => {
                const order = picked.indexOf(t.id);
                return (
                  <li key={t.id} className="flex items-center gap-2 rounded-lg px-2 hover:bg-panel-2">
                    <label className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input type="checkbox" checked={order >= 0} onChange={() => toggle(t.id)} className="size-4 accent-accent" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{t.title}</span>
                        <span className="truncate text-xs text-text-3">
                          {t.artist ?? '—'} · {formatTime(t.duration)} · {sizeMb(t.sizeBytes)}
                        </span>
                      </span>
                      {order >= 0 && <span className="text-xs font-semibold text-accent">{order + 1}</span>}
                    </label>
                    <button
                      type="button"
                      onClick={() => void remove(t)}
                      aria-label={`${t.title} 내 음악에서 삭제`}
                      title="내 음악에서 삭제"
                      className="flex size-9 items-center justify-center rounded-lg text-text-3 hover:bg-line hover:text-text"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          {tooMany && <p className="text-sm text-warn">이 프로젝트에는 {props.maxAdd}곡까지 더 넣을 수 있어요.</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={props.onClose} className="min-h-11 rounded-lg border border-line-strong px-4 text-sm font-semibold hover:bg-panel-2">
              취소
            </button>
            <button
              type="button"
              disabled={picked.length === 0 || tooMany}
              onClick={() => {
                props.onAdd(picked);
                props.onClose();
              }}
              className="min-h-11 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink disabled:opacity-50"
            >
              {picked.length > 0 ? `${picked.length}곡 추가` : '추가'}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
