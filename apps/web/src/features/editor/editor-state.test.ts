import { describe, expect, it } from 'vitest';
import { createDefaultSettings, type ProjectDetail } from '@outpaly/shared';
import { editorReducer, hasUnsavedChanges, initEditor, saveStatus, shouldAutosave } from './editor-state.ts';

const project = (over: Partial<ProjectDetail> = {}): ProjectDetail => ({
  id: 'p1',
  title: '플레이리스트',
  trackCount: 0,
  totalDuration: 0,
  settings: createDefaultSettings('플레이리스트'),
  revision: 0,
  createdAt: '2026-11-23T00:00:00.000Z',
  updatedAt: '2026-11-23T00:00:00.000Z',
  tracks: [],
  ...over
});

const dim = (v: number) => ({
  type: 'updateSettings' as const,
  recipe: (s: ReturnType<typeof createDefaultSettings>) => ({ ...s, background: { ...s.background, dim: v } })
});

describe('editorReducer', () => {
  it('처음엔 저장됨, 편집하면 저장할 것이 생긴다', () => {
    let s = initEditor(project());
    expect(saveStatus(s)).toBe('saved');
    s = editorReducer(s, dim(0.5));
    expect(saveStatus(s)).toBe('dirty');
    expect(shouldAutosave(s)).toBe(true);
    expect(hasUnsavedChanges(s)).toBe(true);
  });

  it('저장 중에 또 편집하면, 저장이 끝나도 다시 저장할 것이 남는다', () => {
    let s = editorReducer(initEditor(project()), dim(0.5)); // rev 1
    const sentRev = s.rev;
    s = editorReducer(s, { type: 'saveStart' });
    s = editorReducer(s, dim(0.6)); // rev 2, 저장 중 편집
    s = editorReducer(s, { type: 'saveSuccess', rev: sentRev, project: project({ revision: 1 }) });
    expect(s.savedRev).toBe(1);
    expect(s.serverRevision).toBe(1);
    expect(saveStatus(s)).toBe('dirty');
  });

  it('제목이 비어 있으면 저장하지 않는다', () => {
    const s = editorReducer(initEditor(project()), { type: 'setTitle', title: '   ' });
    expect(saveStatus(s)).toBe('invalid');
    expect(shouldAutosave(s)).toBe(false);
  });

  it('저장 실패 후에는 다시 시도할 때까지 자동 저장을 멈춘다', () => {
    let s = editorReducer(initEditor(project()), dim(0.5));
    s = editorReducer(s, { type: 'saveStart' });
    s = editorReducer(s, { type: 'saveError', message: '네트워크 오류' });
    expect(saveStatus(s)).toBe('error');
    expect(shouldAutosave(s)).toBe(false);
    s = editorReducer(s, { type: 'retry' });
    expect(shouldAutosave(s)).toBe(true);
  });

  it('충돌: 덮어쓰기는 서버 revision 을 받아 다시 저장하고, 다시 불러오기는 내 변경을 버린다', () => {
    let s = editorReducer(initEditor(project()), dim(0.5));
    s = editorReducer(s, { type: 'saveStart' });
    const theirs = project({ title: '다른 탭', revision: 7 });
    s = editorReducer(s, { type: 'saveConflict', project: theirs });
    expect(saveStatus(s)).toBe('conflict');
    expect(shouldAutosave(s)).toBe(false);

    const overwritten = editorReducer(s, { type: 'overwrite' });
    expect(overwritten.serverRevision).toBe(7);
    expect(overwritten.settings.background.dim).toBe(0.5);
    expect(shouldAutosave(overwritten)).toBe(true);

    const reloaded = editorReducer(s, { type: 'reload', project: theirs });
    expect(reloaded.title).toBe('다른 탭');
    expect(saveStatus(reloaded)).toBe('saved');
  });

  it('설정이 실제로 바뀌지 않으면 rev 를 올리지 않는다', () => {
    const s = initEditor(project());
    expect(editorReducer(s, { type: 'updateSettings', recipe: (x) => x })).toBe(s);
  });
});
