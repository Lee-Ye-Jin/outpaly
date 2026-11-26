// MP4 만들기 화면: 렌더 요청 → 진행 상황(1.5초마다 확인) → 다운로드·타임스탬프 복사, 이전 결과물
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  RENDER_STATUS_LABEL,
  isActiveRender,
  type ProjectDetail,
  type RenderJobDto,
  type RenderStatus
} from '@outpaly/shared';
import { formatTime } from '@outpaly/editor-core';
import { Logo } from '../../components/Logo.tsx';
import { ApiRequestError, projectsApi } from '../../services/api.ts';
import { rendersApi } from '../../services/renders-api.ts';

const POLL_MS = 1500;
const STEPS: RenderStatus[] = ['QUEUED', 'PREPARING', 'PROCESSING', 'UPLOADING', 'COMPLETED'];
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)}MB`;
const dateFmt = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const messageOf = (e: unknown, fallback: string) => (e instanceof ApiRequestError ? e.message : fallback);

export function ExportPage() {
  const { id = '' } = useParams();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [history, setHistory] = useState<RenderJobDto[]>([]);
  const [current, setCurrent] = useState<RenderJobDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 처음: 프로젝트 + 렌더 기록. 진행 중인 작업이 있으면 그것을 보여 준다
  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([projectsApi.get(id, ctrl.signal), rendersApi.listForProject(id, ctrl.signal)])
      .then(([p, r]) => {
        setProject(p.project);
        setHistory(r.renders);
        setCurrent(r.renders[0] ?? null);
      })
      .catch((e: unknown) => !ctrl.signal.aborted && setLoadError(messageOf(e, '불러오지 못했어요.')));
    return () => ctrl.abort();
  }, [id]);

  const upsert = useCallback((job: RenderJobDto) => {
    setCurrent(job);
    setHistory((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
  }, []);

  // 진행 중이면 1.5초마다 상태 확인
  const activeId = current && isActiveRender(current.status) ? current.id : null;
  useEffect(() => {
    if (!activeId) return;
    const ctrl = new AbortController();
    const timer = setInterval(() => {
      rendersApi
        .get(activeId, ctrl.signal)
        .then((r) => upsert(r.render))
        .catch(() => undefined); // 잠깐 끊겨도 다음 확인에서 이어진다
    }, POLL_MS);
    return () => {
      clearInterval(timer);
      ctrl.abort();
    };
  }, [activeId, upsert]);

  async function start() {
    setBusy(true);
    setActionError(null);
    try {
      upsert((await rendersApi.create(id)).render);
    } catch (e) {
      // 이미 진행 중이면 그 작업을 보여 준다
      if (e instanceof ApiRequestError && e.status === 409 && (e.body as { render?: RenderJobDto })?.render) {
        upsert((e.body as { render: RenderJobDto }).render);
      } else setActionError(messageOf(e, '영상 만들기를 시작하지 못했어요.'));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!current) return;
    setBusy(true);
    setActionError(null);
    try {
      upsert((await rendersApi.cancel(current.id)).render);
    } catch (e) {
      setActionError(messageOf(e, '취소하지 못했어요.'));
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p role="alert" className="text-warn">
          {loadError}
        </p>
        <Link to="/" className="text-accent hover:underline">
          내 프로젝트로 가기
        </Link>
      </main>
    );
  }
  if (!project) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p role="status" className="text-text-3">
          불러오는 중…
        </p>
      </main>
    );
  }

  const active = current && isActiveRender(current.status);
  const noTracks = project.trackCount === 0;
  const finished = history.filter((j) => j.status === 'COMPLETED' && j.output);

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-[#111115] px-4 py-2.5 sm:px-5">
        <Link to="/" className="flex min-h-11 items-center" aria-label="내 프로젝트로 돌아가기">
          <Logo />
        </Link>
        <span className="text-text-3" aria-hidden>
          /
        </span>
        <span className="min-w-0 truncate font-semibold">{project.title}</span>
        <div className="flex-1" />
        <Link
          to={`/projects/${project.id}`}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border border-line-strong px-3.5 text-[13px] hover:bg-panel-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          편집기로 돌아가기
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-[1120px] flex-wrap items-start gap-6 px-4 py-10 sm:px-6">
        <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-6 rounded-2xl border border-line bg-panel p-6 sm:p-7">
          <h1 className="font-display text-[26px] font-bold">MP4 만들기</h1>

          <dl className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-3">
            <Stat label="곡 수" value={`${project.trackCount}곡`} />
            <Stat label="영상 길이" value={formatTime(project.totalDuration)} />
            <Stat label="출력" value={`${project.settings.output.width}×${project.settings.output.height}`} />
          </dl>
          <p className="-mt-3 text-xs text-text-3">
            해상도·디자인은 편집기에서 바꿀 수 있어요. 만들기를 누른 순간의 프로젝트로 영상을 만들어요.
          </p>

          {actionError && (
            <p role="alert" className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
              {actionError}
            </p>
          )}

          {active && current ? (
            <Progress job={current} onCancel={cancel} busy={busy} />
          ) : (
            <div className="flex flex-col gap-4">
              {current?.status === 'COMPLETED' && current.output && <Done job={current} />}
              {current?.status === 'FAILED' && (
                <p role="alert" className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
                  <strong className="font-semibold text-warn">영상을 만들지 못했어요.</strong> {current.error}
                </p>
              )}
              {current?.status === 'CANCELLED' && <p className="text-sm text-text-2">마지막 작업을 취소했어요.</p>}
              <button
                type="button"
                onClick={start}
                disabled={busy || noTracks}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-5 font-semibold text-accent-ink hover:brightness-110 disabled:opacity-50"
              >
                {noTracks ? '곡을 추가해야 만들 수 있어요' : current?.status === 'COMPLETED' ? '다시 만들기' : busy ? '요청 중…' : 'MP4 만들기'}
              </button>
            </div>
          )}
        </section>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4 rounded-2xl border border-line bg-panel p-6">
          <Timestamps text={current?.output?.timestamps ?? null} />
          <h2 className="mt-2 text-[15px] font-semibold">이전 결과물</h2>
          {finished.length === 0 ? (
            <p className="text-sm text-text-3">아직 만든 영상이 없어요.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {finished.map((j) => (
                <li key={j.id} className="flex items-center gap-2.5 rounded-[10px] bg-panel-2 px-3 py-2.5 text-[13px]">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span>
                      {dateFmt.format(new Date(j.finishedAt ?? j.createdAt))} · {j.output!.height}p
                    </span>
                    <span className="text-xs text-text-2">
                      {j.trackCount}곡 · {formatTime(j.output!.duration)} · {mb(j.output!.sizeBytes)}
                    </span>
                  </span>
                  <a href={j.output!.downloadUrl} download className="min-h-9 content-center px-1 text-[13px] text-accent hover:underline">
                    다운로드
                  </a>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[10px] bg-panel-2 p-3.5">
      <dt className="text-xs text-text-2">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Progress({ job, onCancel, busy }: { job: RenderJobDto; onCancel: () => void; busy: boolean }) {
  const at = STEPS.indexOf(job.status);
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-[#2A2A33] bg-[#1A1A20] p-5">
      <ol aria-label="렌더링 단계" className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => {
          const state = i < at ? 'done' : i === at ? 'now' : 'todo';
          return (
            <li
              key={s}
              aria-current={state === 'now' ? 'step' : undefined}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium ${
                state === 'now' ? 'bg-[#3A2418] text-warn' : state === 'done' ? 'bg-[#1C2A22] text-ok' : 'bg-[#22222B] text-text-3'
              }`}
            >
              <span aria-hidden className={`size-2 rounded-full ${state === 'now' ? 'bg-accent' : state === 'done' ? 'bg-[#5FCB8A]' : 'bg-[#4A4A55]'}`} />
              {RENDER_STATUS_LABEL[s]}
            </li>
          );
        })}
      </ol>
      <div className="flex justify-between text-[13px]">
        <span>{RENDER_STATUS_LABEL[job.status]}</span>
        <span className="font-semibold tabular-nums">{job.progress}%</span>
      </div>
      <div role="progressbar" aria-label="렌더링 진행률" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded bg-line">
        <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${job.progress}%` }} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-xs text-text-2">창을 닫아도 서버에서 계속 만들어요. 다시 들어오면 이어서 볼 수 있어요.</p>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-9 rounded-lg border border-[#4A2A22] px-3.5 text-[13px] text-[#FF9B85] hover:bg-[#4A2A22]/30 disabled:opacity-50"
        >
          취소
        </button>
      </div>
    </div>
  );
}

function Done({ job }: { job: RenderJobDto }) {
  const out = job.output!;
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[#22432F] bg-[#13241C] p-5">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#8FE0B2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12l3 3 5-6" />
      </svg>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold">영상이 완성됐어요</span>
        <span className="text-xs text-text-2">
          {out.width}×{out.height} · {formatTime(out.duration)} · {mb(out.sizeBytes)}
        </span>
      </span>
      <a
        href={out.downloadUrl}
        download
        className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-accent px-4.5 font-semibold text-accent-ink hover:brightness-110"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </svg>
        MP4 다운로드
      </a>
    </div>
  );
}

function Timestamps({ text }: { text: string | null }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 권한이 없으면 사용자가 직접 선택해 복사할 수 있다
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <h2 className="flex-1 text-[15px] font-semibold">유튜브 설명란 타임스탬프</h2>
        <button
          type="button"
          onClick={copy}
          disabled={!text}
          className="min-h-9 rounded-lg border border-line-strong px-3 text-[13px] hover:bg-panel-2 disabled:opacity-40"
        >
          <span aria-live="polite">{copied ? '복사됨' : '복사'}</span>
        </button>
      </div>
      <p className="text-xs text-text-2">영상과 같은 계산으로 만들어서 곡 시작 시각이 정확히 맞아요.</p>
      <pre className="m-0 min-h-24 rounded-[10px] border border-[#2A2A33] bg-ink p-3.5 font-sans text-[13px] leading-7 whitespace-pre-wrap text-[#E4E3E8] tabular-nums">
        {text ?? '영상이 완성되면 여기에 표시돼요.'}
      </pre>
    </div>
  );
}
