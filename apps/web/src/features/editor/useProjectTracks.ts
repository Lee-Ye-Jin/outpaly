// 편집기의 곡 목록 상태.
// - 화면은 즉시 바꾸고(낙관적 업데이트) 서버 요청은 하나씩 순서대로 보낸다.
// - 서버 응답은 "더 보낼 요청이 없을 때"만 화면에 반영한다. 늦게 온 응답이 더 최신 편집을 덮어쓰지 않게.
// - 요청이 실패하면 오류를 보여 주고 서버의 실제 곡 목록을 다시 불러온다.
// - 제목·구간 같은 필드 편집은 곡별로 0.6초 모아서 한 번에 보낸다.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectTrackDto, ProjectTracksResponse, UpdateProjectTrackInput } from '@outpaly/shared';
import { ApiRequestError } from '../../services/api.ts';
import { projectTracksApi } from '../../services/tracks-api.ts';

const FIELD_DEBOUNCE_MS = 600;
type Patch = UpdateProjectTrackInput;

export function useProjectTracks(projectId: string, initial: ProjectTrackDto[]) {
  const [tracks, setTracks] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const queue = useRef<Promise<void>>(Promise.resolve());
  const inFlight = useRef(0);
  const pendingPatches = useRef(new Map<string, { patch: Patch; timer: ReturnType<typeof setTimeout> }>());

  const resync = useCallback(async () => {
    try {
      const r = await projectTracksApi.list(projectId);
      setTracks(r.tracks);
    } catch {
      // 다음 편집 때 다시 맞춰진다
    }
  }, [projectId]);

  /** 서버 요청을 줄 세워 실행 */
  const enqueue = useCallback(
    (op: () => Promise<ProjectTracksResponse>) => {
      inFlight.current += 1;
      setBusy(true);
      const p = queue.current.then(async () => {
        try {
          const r = await op();
          if (inFlight.current === 1 && pendingPatches.current.size === 0) setTracks(r.tracks);
        } catch (e) {
          setError(e instanceof ApiRequestError ? e.message : '곡 목록을 저장하지 못했어요.');
          await resync();
        } finally {
          inFlight.current -= 1;
          if (inFlight.current === 0) setBusy(false);
        }
      });
      queue.current = p;
      return p;
    },
    [resync]
  );

  const flushPatch = useCallback(
    (ptId: string, opts: { keepalive?: boolean } = {}) => {
      const entry = pendingPatches.current.get(ptId);
      if (!entry) return;
      clearTimeout(entry.timer);
      pendingPatches.current.delete(ptId);
      if (opts.keepalive) {
        void projectTracksApi.update(projectId, ptId, entry.patch, { keepalive: true }).catch(() => undefined);
        return;
      }
      void enqueue(() => projectTracksApi.update(projectId, ptId, entry.patch));
    },
    [enqueue, projectId]
  );

  const flushAll = useCallback(
    (opts: { keepalive?: boolean } = {}) => {
      for (const id of [...pendingPatches.current.keys()]) flushPatch(id, opts);
    },
    [flushPatch]
  );

  /** 업로드를 마친 곡(들)을 끝에 추가 */
  const add = useCallback(
    (trackIds: string[]) => {
      setError(null);
      flushAll();
      return enqueue(() => projectTracksApi.add(projectId, { trackIds }));
    },
    [enqueue, flushAll, projectId]
  );

  const reorder = useCallback(
    (orderedIds: string[]) => {
      setError(null);
      flushAll();
      setTracks((prev) => {
        const byId = new Map(prev.map((t) => [t.id, t]));
        return orderedIds.map((id, i) => ({ ...byId.get(id)!, sortOrder: i }));
      });
      void enqueue(() => projectTracksApi.reorder(projectId, orderedIds));
    },
    [enqueue, flushAll, projectId]
  );

  /** 필드 편집: 화면은 바로, 서버는 0.6초 모아서 */
  const update = useCallback(
    (ptId: string, patch: Patch) => {
      setError(null);
      setTracks((prev) => prev.map((t) => (t.id === ptId ? { ...t, ...(patch as Partial<ProjectTrackDto>) } : t)));
      const prevEntry = pendingPatches.current.get(ptId);
      if (prevEntry) clearTimeout(prevEntry.timer);
      const merged = { ...(prevEntry?.patch ?? {}), ...patch };
      pendingPatches.current.set(ptId, { patch: merged, timer: setTimeout(() => flushPatch(ptId), FIELD_DEBOUNCE_MS) });
    },
    [flushPatch]
  );

  const remove = useCallback(
    (ptId: string) => {
      setError(null);
      const pending = pendingPatches.current.get(ptId);
      if (pending) {
        clearTimeout(pending.timer);
        pendingPatches.current.delete(ptId);
      }
      setTracks((prev) => prev.filter((t) => t.id !== ptId).map((t, i) => ({ ...t, sortOrder: i })));
      void enqueue(() => projectTracksApi.remove(projectId, ptId));
    },
    [enqueue, projectId]
  );

  // 편집기를 떠나거나 탭을 닫을 때 모아 둔 필드 편집을 보낸다
  useEffect(() => {
    const onHide = () => flushAll({ keepalive: true });
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      flushAll({ keepalive: true });
    };
  }, [flushAll]);

  const hasPending = busy || pendingPatches.current.size > 0;
  return { tracks, error, clearError: () => setError(null), busy: hasPending, add, reorder, update, remove };
}
