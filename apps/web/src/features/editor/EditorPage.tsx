import { useCallback, useEffect, useMemo, useReducer, useState, type Dispatch } from 'react';
import { Link, useParams } from 'react-router';
import type { ProjectDetail, ProjectDoc, ProjectSettings, ProjectTrackDoc } from '@outpaly/shared';
import { formatTime, totalDuration } from '@outpaly/editor-core';
import { Logo } from '../../components/Logo.tsx';
import { ApiRequestError, projectsApi } from '../../services/api.ts';
import { ProjectCanvas } from '../render/ProjectCanvas.tsx';
import { DesignPanel } from './DesignPanel.tsx';
import { editorReducer, initEditor, saveStatus, titleError, type EditorAction, type EditorState } from './editor-state.ts';
import { useAutosave } from './useAutosave.ts';

type Load = { kind: 'loading' } | { kind: 'ready'; project: ProjectDetail } | { kind: 'notFound' } | { kind: 'error'; message: string };

export function EditorPage() {
  const { id = '' } = useParams();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  useEffect(() => {
    const ctrl = new AbortController();
    setLoad({ kind: 'loading' });
    projectsApi
      .get(id, ctrl.signal)
      .then(({ project }) => setLoad({ kind: 'ready', project }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        if (e instanceof ApiRequestError && e.status === 404) setLoad({ kind: 'notFound' });
        else setLoad({ kind: 'error', message: e instanceof ApiRequestError ? e.message : '프로젝트를 불러오지 못했어요.' });
      });
    return () => ctrl.abort();
  }, [id]);

  if (load.kind === 'ready') return <Editor key={load.project.id} project={load.project} />;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      {load.kind === 'loading' && (
        <p role="status" className="text-text-3">
          프로젝트를 불러오는 중…
        </p>
      )}
      {load.kind === 'notFound' && (
        <>
          <h1 className="font-display text-2xl font-bold">프로젝트를 찾을 수 없어요</h1>
          <p className="text-text-2">삭제됐거나 접근 권한이 없는 프로젝트예요.</p>
        </>
      )}
      {load.kind === 'error' && (
        <p role="alert" className="text-warn">
          {load.message}
        </p>
      )}
      {load.kind !== 'loading' && (
        <Link to="/" className="text-accent hover:underline">
          내 프로젝트로 가기
        </Link>
      )}
    </main>
  );
}

// 곡이 없을 때 트랙리스트 배치를 볼 수 있도록 보여 주는 예시 (저장되지 않음)
const PLACEHOLDER_TRACKS: ProjectTrackDoc[] = [214, 187, 242, 201, 228].map((d, i) => ({
  id: `placeholder-${i}`,
  trackId: '',
  displayTitle: `예시 곡 ${i + 1}`,
  displayArtist: '',
  sourceDuration: d,
  trimStart: 0,
  trimEnd: null,
  gain: 0,
  gapAfter: 0
}));

const NO_TRACKS: ProjectTrackDoc[] = [];

function Editor({ project }: { project: ProjectDetail }) {
  const [state, dispatch] = useReducer(editorReducer, project, initEditor);
  useAutosave(state, dispatch);

  const update = useCallback((recipe: (s: ProjectSettings) => ProjectSettings) => dispatch({ type: 'updateSettings', recipe }), []);
  const tracks = NO_TRACKS; // Phase 4 에서 project_tracks 로 채운다
  const usingPlaceholder = tracks.length === 0;

  const previewDoc = useMemo<ProjectDoc>(
    () => ({ ...state.settings, title: state.title, tracks: usingPlaceholder ? PLACEHOLDER_TRACKS : tracks }),
    [state.settings, state.title, usingPlaceholder, tracks]
  );

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar state={state} dispatch={dispatch} />
      {state.conflict && <ConflictBanner state={state} dispatch={dispatch} />}

      <div className="flex flex-1 flex-wrap items-stretch">
        <section aria-label="플레이리스트" className="flex min-w-0 flex-[1_1_280px] flex-col border-r border-line bg-[#121216] lg:max-w-[340px]">
          <div className="flex items-baseline justify-between px-5 pt-5 pb-3">
            <h2 className="text-[15px] font-semibold">플레이리스트</h2>
            <span className="text-xs text-text-2">{tracks.length}곡</span>
          </div>
          <div className="mx-5 rounded-xl border-[1.5px] border-dashed border-line-strong bg-[#16161B] p-4 text-sm text-text-2">
            <p className="font-medium text-text">음악 업로드는 Phase 4 에서 열려요.</p>
            <p className="mt-1 text-xs text-text-3">MP3 · WAV 를 끌어다 놓아 곡을 추가하게 돼요.</p>
          </div>
          <div className="flex-1" />
          <div className="flex justify-between border-t border-line px-5 py-3.5 text-sm">
            <span className="text-text-2">전체 길이</span>
            <span className="font-semibold tabular-nums">{formatTime(totalDuration(tracks))}</span>
          </div>
        </section>

        <section aria-label="미리보기" className="flex min-w-0 flex-[999_1_560px] flex-col gap-3 p-6">
          <div className="mx-auto w-full max-w-[1040px]">
            <ProjectCanvas
              doc={previewDoc}
              current={usingPlaceholder ? 1 : -1}
              className="w-full rounded-[10px] bg-panel-2 shadow-[0_0_0_1px_var(--color-line)]"
              label={`${state.title} 미리보기`}
            />
            <p className="mt-2.5 flex flex-wrap justify-between gap-2 text-xs text-text-3">
              <span>{usingPlaceholder ? '곡이 없어서 예시 곡으로 트랙리스트 배치를 보여 줘요.' : ''}</span>
              <span>
                {state.settings.output.width} × {state.settings.output.height} · 이 화면 그대로 MP4 로 만들어져요
              </span>
            </p>
          </div>
        </section>

        <aside aria-label="디자인" className="min-w-0 flex-[1_1_280px] border-l border-line bg-[#121216] lg:max-w-[340px]">
          <DesignPanel settings={state.settings} update={update} />
        </aside>
      </div>
    </div>
  );
}

function TopBar({ state, dispatch }: { state: EditorState; dispatch: Dispatch<EditorAction> }) {
  const err = titleError(state);
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-line bg-[#111115] px-4 py-2.5 sm:px-5">
      <Link to="/" className="flex min-h-11 items-center" aria-label="내 프로젝트로 돌아가기">
        <Logo />
      </Link>
      <span className="text-text-3" aria-hidden>
        /
      </span>
      <label className="sr-only" htmlFor="project-title">
        프로젝트 이름
      </label>
      <input
        id="project-title"
        value={state.title}
        maxLength={120}
        onChange={(e) => dispatch({ type: 'setTitle', title: e.target.value })}
        aria-invalid={err ? true : undefined}
        title={err ?? undefined}
        className={`min-h-10 w-[min(22rem,100%)] min-w-0 rounded-lg border bg-transparent px-2.5 font-semibold outline-none hover:border-line-strong focus:border-accent ${
          err ? 'border-warn' : 'border-transparent'
        }`}
      />
      <SaveIndicator state={state} dispatch={dispatch} />
      <div className="flex-1" />
      <button
        type="button"
        disabled
        title="렌더링은 Phase 6 에서 열려요"
        className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-accent px-4 font-semibold text-accent-ink opacity-50"
      >
        MP4 만들기
      </button>
    </header>
  );
}

function SaveIndicator({ state, dispatch }: { state: EditorState; dispatch: Dispatch<EditorAction> }) {
  const status = saveStatus(state);
  const text: Record<typeof status, string> = {
    saved: '저장됨',
    dirty: '변경 사항 저장 대기',
    saving: '저장 중…',
    error: `저장 실패: ${state.error ?? ''}`,
    invalid: titleError(state) ?? '',
    conflict: '저장 충돌'
  };
  const color = status === 'error' || status === 'invalid' || status === 'conflict' ? 'text-warn' : 'text-text-3';
  return (
    <span role="status" aria-live="polite" className={`flex items-center gap-2 text-xs ${color}`}>
      {status === 'saved' && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5FCB8A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12l5 5L20 7" />
        </svg>
      )}
      {text[status]}
      {status === 'error' && (
        <button
          type="button"
          onClick={() => dispatch({ type: 'retry' })}
          className="min-h-8 rounded-md border border-line-strong px-2 text-text hover:bg-panel-2"
        >
          다시 시도
        </button>
      )}
    </span>
  );
}

function ConflictBanner({ state, dispatch }: { state: EditorState; dispatch: Dispatch<EditorAction> }) {
  const theirs = state.conflict!;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-warn/40 bg-warn/10 px-5 py-3 text-sm">
      <p className="flex-1">
        다른 탭이나 기기에서 이 프로젝트가 먼저 저장됐어요. 최신 내용을 불러오면 이 화면에서 바꾼 내용은 사라져요.
      </p>
      <button
        type="button"
        onClick={() => dispatch({ type: 'reload', project: theirs })}
        className="min-h-10 rounded-lg bg-accent px-3 font-semibold text-accent-ink"
      >
        최신 내용 불러오기
      </button>
      <button type="button" onClick={() => dispatch({ type: 'overwrite' })} className="min-h-10 rounded-lg border border-line-strong px-3 hover:bg-panel-2">
        내 변경으로 덮어쓰기
      </button>
    </div>
  );
}
