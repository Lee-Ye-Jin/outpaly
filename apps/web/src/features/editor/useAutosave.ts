import { useEffect, useRef, type Dispatch } from 'react';
import type { ProjectConflictResponse } from '@outpaly/shared';
import { ApiRequestError, projectsApi } from '../../services/api.ts';
import { hasUnsavedChanges, shouldAutosave, type EditorAction, type EditorState } from './editor-state.ts';

const DEBOUNCE_MS = 800;

/**
 * 편집이 멈추고 0.8초 뒤 저장한다.
 * - 저장 중 또 편집하면 끝난 뒤 다시 저장
 * - 탭을 닫거나 다른 화면으로 가면 남은 변경을 keepalive 요청으로 보낸다
 * - 저장하지 않은 변경이 있으면 창 닫기 전에 브라우저가 확인을 묻는다
 */
export function useAutosave(state: EditorState, dispatch: Dispatch<EditorAction>) {
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    if (!shouldAutosave(state)) return;
    const timer = setTimeout(async () => {
      const snap = latest.current;
      if (!shouldAutosave(snap)) return;
      dispatch({ type: 'saveStart' });
      try {
        const { project } = await projectsApi.update(snap.projectId, {
          title: snap.title,
          settings: snap.settings,
          expectedRevision: snap.serverRevision
        });
        dispatch({ type: 'saveSuccess', rev: snap.rev, project });
      } catch (e) {
        if (e instanceof ApiRequestError && e.status === 409) {
          dispatch({ type: 'saveConflict', project: (e.body as ProjectConflictResponse).project });
        } else {
          dispatch({ type: 'saveError', message: e instanceof ApiRequestError ? e.message : '저장하지 못했어요.' });
        }
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state, dispatch]);

  // 페이지를 떠날 때
  useEffect(() => {
    function flush() {
      const s = latest.current;
      if (!shouldAutosave(s)) return;
      void projectsApi
        .update(s.projectId, { title: s.title, settings: s.settings, expectedRevision: s.serverRevision }, { keepalive: true })
        .catch(() => undefined);
    }
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (hasUnsavedChanges(latest.current)) e.preventDefault();
    }
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', onBeforeUnload);
      flush(); // 편집기에서 다른 화면으로 이동 (컴포넌트 해제)
    };
  }, []);
}
