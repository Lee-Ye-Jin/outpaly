import { useEffect, useState } from 'react';
import type { ProjectSummary } from '@outpaly/shared';
import { AppHeader } from '../../components/AppHeader.tsx';
import { useAuth } from '../auth/AuthContext.tsx';
import { ApiRequestError, projectsApi } from '../../services/api.ts';

type ListState =
  | { kind: 'loading' }
  | { kind: 'ready'; projects: ProjectSummary[] }
  | { kind: 'error'; message: string };

const dateFmt = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function DashboardPage() {
  const { state: auth } = useAuth();
  const [list, setList] = useState<ListState>({ kind: 'loading' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    projectsApi
      .list(ctrl.signal)
      .then(({ projects }) => setList({ kind: 'ready', projects }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setList({ kind: 'error', message: e instanceof ApiRequestError ? e.message : '목록을 불러오지 못했어요.' });
      });
    return () => ctrl.abort();
  }, []);

  async function onCreate() {
    setCreating(true);
    setCreateError(null);
    try {
      const { project } = await projectsApi.create({ title: '새 플레이리스트' });
      // Phase 3 에서 편집기(/projects/:id)로 이동하도록 바뀐다
      setList((prev) => (prev.kind === 'ready' ? { kind: 'ready', projects: [project, ...prev.projects] } : prev));
    } catch (e) {
      setCreateError(e instanceof ApiRequestError ? e.message : '프로젝트를 만들지 못했어요.');
    } finally {
      setCreating(false);
    }
  }

  const name = auth.user?.displayName ?? auth.user?.email.split('@')[0];

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto flex max-w-6xl flex-col gap-7 px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <h1 className="font-display text-3xl font-bold tracking-tight">내 프로젝트</h1>
            <p className="mt-1.5 text-text-2">{name}님, 음악을 모아 플레이리스트 영상으로 만들어요.</p>
          </div>
          <button
            type="button"
            onClick={onCreate}
            disabled={creating}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-5 font-semibold text-accent-ink hover:brightness-110 disabled:opacity-60"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            {creating ? '만드는 중…' : '새 플레이리스트'}
          </button>
        </div>

        {createError && (
          <p role="alert" className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
            {createError}
          </p>
        )}

        {list.kind === 'loading' && <p className="text-text-3" role="status">불러오는 중…</p>}
        {list.kind === 'error' && (
          <p role="alert" className="text-warn">
            {list.message}
          </p>
        )}
        {list.kind === 'ready' && list.projects.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
            <p className="font-medium">아직 프로젝트가 없어요.</p>
            <p className="mt-1 text-sm text-text-2">"새 플레이리스트"를 눌러 첫 영상을 만들어 보세요.</p>
          </div>
        )}
        {list.kind === 'ready' && list.projects.length > 0 && (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
            {list.projects.map((p) => (
              <li key={p.id} className="overflow-hidden rounded-2xl border border-line bg-panel">
                <div className="relative aspect-video bg-[#3A2E2A]">
                  <div className="absolute inset-x-0 bottom-0 h-[38%] bg-[#2A211F]" />
                  <span className="absolute top-3 right-[40%] left-3.5 font-display text-[17px] leading-tight font-bold text-white">
                    {p.title}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 px-4 pt-3.5 pb-4">
                  <span className="truncate font-semibold">{p.title}</span>
                  <span className="text-sm text-text-2">
                    {p.trackCount}곡 · {dateFmt.format(new Date(p.updatedAt))}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
