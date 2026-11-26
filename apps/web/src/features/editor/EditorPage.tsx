import { useCallback, useEffect, useMemo, useReducer, useState, type CSSProperties, type Dispatch } from 'react';
import { Link, useParams } from 'react-router';
import {
  MAX_TRACKS_PER_PROJECT,
  toProjectTrackDoc,
  type ProjectDetail,
  type ProjectDoc,
  type ProjectSettings,
  type ProjectTrackDoc
} from '@outpaly/shared';
import { computeStarts } from '@outpaly/editor-core';
import { Logo } from '../../components/Logo.tsx';
import { ApiRequestError, projectsApi } from '../../services/api.ts';
import { ProjectCanvas } from '../render/ProjectCanvas.tsx';
import { DesignPanel } from './DesignPanel.tsx';
import { editorReducer, initEditor, saveStatus, titleError, type EditorAction, type EditorState } from './editor-state.ts';
import { LibraryDialog } from './LibraryDialog.tsx';
import { LayoutOverlay } from './LayoutOverlay.tsx';
import { useActualSizePref, useDevicePixelRatio, usePreviewZoom } from './usePreviewScale.ts';
import type { FrameLayout } from '@outpaly/render-core';
import { PlaylistPanel } from './PlaylistPanel.tsx';
import { TrackSettingsPanel } from './TrackSettingsPanel.tsx';
import { Transport } from './Transport.tsx';
import { useAutosave } from './useAutosave.ts';
import { usePlaylistPlayer } from './usePlaylistPlayer.ts';
import { useProjectTracks } from './useProjectTracks.ts';
import { useUploads } from './useUploads.ts';

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

function Editor({ project }: { project: ProjectDetail }) {
  const [state, dispatch] = useReducer(editorReducer, project, initEditor);
  useAutosave(state, dispatch);
  const update = useCallback((recipe: (s: ProjectSettings) => ProjectSettings) => dispatch({ type: 'updateSettings', recipe }), []);

  // ---- 곡 ----
  const pts = useProjectTracks(project.id, project.tracks);
  const docs = useMemo(() => pts.tracks.map(toProjectTrackDoc), [pts.tracks]);
  const { add } = pts;
  const uploads = useUploads(useCallback((uploaded) => add(uploaded.map((t) => t.id)), [add]));
  const player = usePlaylistPlayer(pts.tracks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'design' | 'track'>('design');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [layout, setLayout] = useState<FrameLayout | null>(null);
  const [actualSize, setActualSize] = useActualSizePref();
  const dpr = useDevicePixelRatio();
  const { ref: frameRef, pct: zoomPct } = usePreviewZoom(state.settings.output.width, dpr);

  const selectedIndex = pts.tracks.findIndex((t) => t.id === selectedId);
  const selected = selectedIndex >= 0 ? pts.tracks[selectedIndex] : undefined;
  const starts = useMemo(() => computeStarts(docs), [docs]);

  function selectTrack(id: string) {
    setSelectedId(id);
    setTab('track');
    const i = pts.tracks.findIndex((t) => t.id === id);
    if (i >= 0) player.seek(starts[i] ?? 0);
  }

  // ---- 미리보기 ----
  const usingPlaceholder = docs.length === 0;
  const previewDoc = useMemo<ProjectDoc>(
    () => ({ ...state.settings, title: state.title, tracks: usingPlaceholder ? PLACEHOLDER_TRACKS : docs }),
    [state.settings, state.title, usingPlaceholder, docs]
  );
  // 재생 위치의 곡을 강조. 재생 전에는 고른 곡
  const highlight = usingPlaceholder ? 1 : player.index >= 0 ? player.index : selectedIndex;

  return (
    // 넓은 화면: 편집기를 창 높이에 고정하고 양쪽 패널만 각자 스크롤. 좁은 화면: 위아래로 쌓고 페이지 스크롤
    <div className="flex min-h-screen flex-col lg:h-screen lg:min-h-0 lg:overflow-hidden">
      <TopBar state={state} dispatch={dispatch} tracksBusy={pts.busy} trackCount={pts.tracks.length} />
      {state.conflict && <ConflictBanner state={state} dispatch={dispatch} />}
      {pts.error && (
        <div role="alert" className="flex items-center gap-3 border-b border-warn/40 bg-warn/10 px-5 py-2.5 text-sm">
          <p className="flex-1">{pts.error}</p>
          <button type="button" onClick={pts.clearError} className="min-h-9 rounded-lg border border-line-strong px-3 hover:bg-panel-2">
            닫기
          </button>
        </div>
      )}

      <div className="flex flex-1 flex-wrap items-stretch lg:min-h-0 lg:flex-nowrap">
        <PlaylistPanel
          tracks={docs}
          selectedId={selectedId}
          playingIndex={player.playing ? player.index : -1}
          uploads={uploads.items}
          onSelect={selectTrack}
          onReorder={pts.reorder}
          onFiles={uploads.start}
          onDismissUpload={uploads.dismiss}
          onOpenLibrary={() => setLibraryOpen(true)}
        />

        {/* 미리보기 칸: 넓은 화면에서는 남은 공간에 "미리보기 + 안내 + 재생 막대" 묶음을 통째로 맞춘다.
            묶음 너비 = min(칸 너비, (칸 높이 - 아래 줄들 높이) × 화면 비율) → 창이 낮아도 재생 막대까지 보이고, 사이가 벌어지지 않는다 */}
        <section
          aria-label="미리보기"
          className="flex min-w-0 flex-[999_1_560px] items-center justify-center p-4 sm:p-6 lg:min-h-0 lg:[container-type:size]"
        >
          <div
            className={`flex w-full flex-col gap-3 ${actualSize ? 'lg:w-[100cqw]' : 'lg:w-[min(100cqw,calc((100cqh-7.5rem)*var(--ar)))]'}`}
            style={{ '--ar': state.settings.output.width / state.settings.output.height } as CSSProperties}
          >
            {/* 실제 크기: 영상 1픽셀 = 모니터 1픽셀 (Windows 화면 배율도 반영). 넘치면 이 칸 안에서 스크롤 */}
            <div className={actualSize ? 'max-h-[65vh] overflow-auto rounded-[10px] lg:max-h-[calc(100cqh-7.5rem)]' : ''}>
              <div
                ref={frameRef}
                className="relative"
                style={actualSize ? { width: state.settings.output.width / dpr } : undefined}
              >
                <ProjectCanvas
                  doc={previewDoc}
                  current={highlight}
                  className="block w-full rounded-[10px] bg-panel-2 shadow-[0_0_0_1px_var(--color-line)]"
                  label={`${state.title} 미리보기`}
                  onLayout={setLayout}
                />
                <LayoutOverlay layout={layout} settings={state.settings} update={update} />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-text-3">
              <span>
                제목·트랙리스트를 끌어서 옮길 수 있어요{usingPlaceholder ? ' · 곡이 없어서 예시 곡으로 보여 줘요' : ''}
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums" aria-live="polite">
                  {state.settings.output.width}×{state.settings.output.height} · {zoomPct ? `${zoomPct}%로 보는 중` : ''}
                </span>
                <button
                  type="button"
                  aria-pressed={actualSize}
                  onClick={() => setActualSize(!actualSize)}
                  className="min-h-8 rounded-md border border-line-strong px-2 text-text-2 hover:bg-panel-2 hover:text-text"
                >
                  {actualSize ? '화면에 맞추기' : '실제 크기로 보기'}
                </button>
              </span>
            </div>
            <Transport
              tracks={docs}
              playing={player.playing}
              time={player.time}
              index={player.index}
              error={player.error}
              onToggle={player.toggle}
              onSeek={player.seek}
            />
          </div>
        </section>

        <aside aria-label="설정" className="flex min-w-0 flex-[1_1_280px] flex-col border-l border-line bg-[#121216] lg:min-h-0 lg:max-w-[340px]">
          <div role="tablist" aria-label="설정 패널" className="flex gap-1 border-b border-line p-3">
            {(
              [
                ['design', '디자인'],
                ['track', '곡 설정']
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                disabled={key === 'track' && !selected}
                onClick={() => setTab(key)}
                className={`min-h-10 flex-1 rounded-lg text-[13px] font-semibold disabled:opacity-40 ${
                  tab === key ? 'bg-[#2A2A34] text-text' : 'text-text-2 hover:text-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'track' && selected ? (
              <TrackSettingsPanel
                key={selected.id}
                pt={selected}
                index={selectedIndex}
                onChange={(patch) => pts.update(selected.id, patch)}
                onPreview={() => player.playFrom(starts[selectedIndex] ?? 0)}
                onRemove={() => {
                  pts.remove(selected.id);
                  setSelectedId(null);
                  setTab('design');
                }}
              />
            ) : (
              <DesignPanel settings={state.settings} update={update} layout={layout} />
            )}
          </div>
        </aside>
      </div>

      <LibraryDialog
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onAdd={(ids) => void pts.add(ids)}
        maxAdd={MAX_TRACKS_PER_PROJECT - pts.tracks.length}
      />
    </div>
  );
}

function TopBar({
  state,
  dispatch,
  tracksBusy,
  trackCount
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  tracksBusy: boolean;
  trackCount: number;
}) {
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
      <SaveIndicator state={state} dispatch={dispatch} tracksBusy={tracksBusy} />
      <div className="flex-1" />
      {trackCount > 0 ? (
        // 편집기를 떠날 때 남은 변경은 keepalive 로 저장된다 (useAutosave, useProjectTracks)
        <Link
          to={`/projects/${state.projectId}/export`}
          className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-accent px-4 font-semibold text-accent-ink hover:brightness-110"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
          </svg>
          MP4 만들기
        </Link>
      ) : (
        <button
          type="button"
          disabled
          title="곡을 추가하면 영상을 만들 수 있어요"
          className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-accent px-4 font-semibold text-accent-ink opacity-50"
        >
          MP4 만들기
        </button>
      )}
    </header>
  );
}

function SaveIndicator({ state, dispatch, tracksBusy }: { state: EditorState; dispatch: Dispatch<EditorAction>; tracksBusy: boolean }) {
  const designStatus = saveStatus(state);
  // 디자인은 저장됐어도 곡 편집이 서버로 가는 중이면 "저장 중"
  const status = designStatus === 'saved' && tracksBusy ? 'saving' : designStatus;
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
