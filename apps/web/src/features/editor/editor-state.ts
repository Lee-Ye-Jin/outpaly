// 편집기 상태와 자동 저장 상태. React 와 분리된 순수 함수라 단위 테스트한다.
//
// rev      : 편집할 때마다 1 증가
// savedRev : 서버에 저장이 확인된 rev
// rev !== savedRev 이면 저장할 것이 남아 있다.

import { CreateProjectInput, type ProjectDetail, type ProjectSettings } from '@outpaly/shared';

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict' | 'invalid';

export interface EditorState {
  projectId: string;
  title: string;
  settings: ProjectSettings;
  serverUpdatedAt: string;
  rev: number;
  savedRev: number;
  saving: boolean;
  error: string | null;
  /** 409: 다른 곳에서 먼저 저장됨. 서버의 최신 상태 */
  conflict: ProjectDetail | null;
}

export type EditorAction =
  | { type: 'setTitle'; title: string }
  | { type: 'updateSettings'; recipe: (s: ProjectSettings) => ProjectSettings }
  | { type: 'saveStart' }
  | { type: 'saveSuccess'; rev: number; project: ProjectDetail }
  | { type: 'saveError'; message: string }
  | { type: 'saveConflict'; project: ProjectDetail }
  | { type: 'retry' }
  /** 충돌 시 서버 최신 상태로 다시 시작 (내 변경은 버림) */
  | { type: 'reload'; project: ProjectDetail }
  /** 충돌 시 내 변경으로 덮어쓰기: 서버 updatedAt 을 받아들이고 다시 저장 */
  | { type: 'overwrite' };

export function initEditor(project: ProjectDetail): EditorState {
  return {
    projectId: project.id,
    title: project.title,
    settings: project.settings,
    serverUpdatedAt: project.updatedAt,
    rev: 0,
    savedRev: 0,
    saving: false,
    error: null,
    conflict: null
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'setTitle':
      return { ...state, title: action.title, rev: state.rev + 1 };
    case 'updateSettings': {
      const settings = action.recipe(state.settings);
      if (settings === state.settings) return state;
      return { ...state, settings, rev: state.rev + 1 };
    }
    case 'saveStart':
      return { ...state, saving: true, error: null };
    case 'saveSuccess':
      return {
        ...state,
        saving: false,
        // 저장하는 동안 또 편집했다면 그 변경은 아직 저장 안 됨 → savedRev 는 보낸 rev 까지만
        savedRev: Math.max(state.savedRev, action.rev),
        serverUpdatedAt: action.project.updatedAt
      };
    case 'saveError':
      return { ...state, saving: false, error: action.message };
    case 'saveConflict':
      return { ...state, saving: false, conflict: action.project };
    case 'retry':
      return { ...state, error: null };
    case 'reload':
      return initEditor(action.project);
    case 'overwrite':
      if (!state.conflict) return state;
      return { ...state, serverUpdatedAt: state.conflict.updatedAt, conflict: null, error: null };
  }
}

export function titleError(state: EditorState): string | null {
  const r = CreateProjectInput.shape.title.safeParse(state.title);
  return r.success ? null : (r.error.issues[0]?.message ?? '제목을 확인해 주세요.');
}

export function saveStatus(state: EditorState): SaveStatus {
  if (state.conflict) return 'conflict';
  if (state.saving) return 'saving';
  if (state.error) return 'error';
  if (state.rev === state.savedRev) return 'saved';
  if (titleError(state)) return 'invalid';
  return 'dirty';
}

/** 자동 저장을 지금 걸어도 되는가 */
export function shouldAutosave(state: EditorState): boolean {
  return saveStatus(state) === 'dirty';
}

export function hasUnsavedChanges(state: EditorState): boolean {
  return state.rev !== state.savedRev || state.saving;
}
