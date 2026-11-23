import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { CreateProjectInput, type ProjectSummary } from '@outpaly/shared';
import { AppHeader } from '../../components/AppHeader.tsx';
import { ConfirmDialog, PromptDialog } from '../../components/Dialog.tsx';
import { useAuth } from '../auth/AuthContext.tsx';
import { ApiRequestError, projectsApi } from '../../services/api.ts';
import { ProjectCard } from './ProjectCard.tsx';

type ListState =
  | { kind: 'loading' }
  | { kind: 'ready'; projects: ProjectSummary[] }
  | { kind: 'error'; message: string };

type Pending =
  | { kind: 'none' }
  | { kind: 'rename'; project: ProjectSummary }
  | { kind: 'delete'; project: ProjectSummary };

const messageOf = (e: unknown, fallback: string) => (e instanceof ApiRequestError ? e.message : fallback);

export function DashboardPage() {
  const { state: auth } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState<ListState>({ kind: 'loading' });
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Pending>({ kind: 'none' });
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    projectsApi
      .list(ctrl.signal)
      .then(({ projects }) => setList({ kind: 'ready', projects }))
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setList({ kind: 'error', message: messageOf(e, '목록을 불러오지 못했어요.') });
      });
    return () => ctrl.abort();
  }, []);

  const updateList = (fn: (ps: ProjectSummary[]) => ProjectSummary[]) =>
    setList((prev) => (prev.kind === 'ready' ? { kind: 'ready', projects: fn(prev.projects) } : prev));

  function closeDialog() {
    setDialog({ kind: 'none' });
    setDialogError(null);
    setDialogBusy(false);
  }

  async function onCreate() {
    setCreating(true);
    setNotice(null);
    try {
      const { project } = await projectsApi.create({ title: '새 플레이리스트' });
      navigate(`/projects/${project.id}`);
    } catch (e) {
      setNotice(messageOf(e, '프로젝트를 만들지 못했어요.'));
      setCreating(false);
    }
  }

  async function onDuplicate(p: ProjectSummary) {
    setNotice(null);
    try {
      const { project } = await projectsApi.duplicate(p.id);
      updateList((ps) => [project, ...ps]);
    } catch (e) {
      setNotice(messageOf(e, '복제하지 못했어요.'));
    }
  }

  async function onRenameSubmit(value: string) {
    if (dialog.kind !== 'rename') return;
    const parsed = CreateProjectInput.shape.title.safeParse(value);
    if (!parsed.success) {
      setDialogError(parsed.error.issues[0]?.message ?? '제목을 확인해 주세요.');
      return;
    }
    setDialogBusy(true);
    try {
      const { project } = await projectsApi.update(dialog.project.id, { title: parsed.data });
      updateList((ps) => [project, ...ps.filter((x) => x.id !== project.id)]);
      closeDialog();
    } catch (e) {
      setDialogError(messageOf(e, '이름을 바꾸지 못했어요.'));
      setDialogBusy(false);
    }
  }

  async function onDeleteConfirm() {
    if (dialog.kind !== 'delete') return;
    setDialogBusy(true);
    try {
      await projectsApi.remove(dialog.project.id);
      const id = dialog.project.id;
      updateList((ps) => ps.filter((x) => x.id !== id));
      closeDialog();
    } catch (e) {
      setDialogError(messageOf(e, '삭제하지 못했어요.'));
      setDialogBusy(false);
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

        {notice && (
          <p role="alert" className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
            {notice}
          </p>
        )}

        {list.kind === 'loading' && (
          <p className="text-text-3" role="status">
            불러오는 중…
          </p>
        )}
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
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
            {list.projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                onRename={() => setDialog({ kind: 'rename', project: p })}
                onDuplicate={() => void onDuplicate(p)}
                onDelete={() => setDialog({ kind: 'delete', project: p })}
              />
            ))}
          </ul>
        )}
      </main>

      <PromptDialog
        open={dialog.kind === 'rename'}
        title="이름 바꾸기"
        label="프로젝트 이름"
        initialValue={dialog.kind === 'rename' ? dialog.project.title : ''}
        confirmLabel="저장"
        maxLength={120}
        pending={dialogBusy}
        error={dialogError}
        onSubmit={(v) => void onRenameSubmit(v)}
        onClose={closeDialog}
      />
      <ConfirmDialog
        open={dialog.kind === 'delete'}
        title="프로젝트를 삭제할까요?"
        message={
          dialog.kind === 'delete' ? (
            <>
              <strong className="text-text">{dialog.project.title}</strong> 프로젝트와 렌더링 기록이 삭제되고, 되돌릴 수 없어요.
              업로드한 음악 파일은 내 음악 목록에 남아요.
            </>
          ) : null
        }
        confirmLabel="삭제"
        danger
        pending={dialogBusy}
        error={dialogError}
        onConfirm={() => void onDeleteConfirm()}
        onClose={closeDialog}
      />
    </div>
  );
}
