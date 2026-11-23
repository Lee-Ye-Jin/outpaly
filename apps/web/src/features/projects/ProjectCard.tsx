import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { ProjectDoc, ProjectSummary } from '@outpaly/shared';
import { ProjectCanvas } from '../render/ProjectCanvas.tsx';

const dateFmt = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-10 items-center justify-center rounded-lg text-text-2 hover:bg-panel-2 hover:text-text"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

export function ProjectCard(props: {
  project: ProjectSummary;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const p = props.project;
  const doc = useMemo<ProjectDoc>(() => ({ ...p.settings, title: p.title, tracks: [] }), [p.settings, p.title]);

  return (
    <li className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-panel focus-within:border-line-strong hover:border-line-strong">
      <Link to={`/projects/${p.id}`} className="block focus:outline-none" aria-label={`${p.title} 편집하기`}>
        <ProjectCanvas doc={doc} pixelWidth={480} className="block w-full bg-panel-2" label={`${p.title} 썸네일`} />
      </Link>
      <div className="flex items-start gap-1 py-2.5 pr-2 pl-4">
        <Link to={`/projects/${p.id}`} className="flex min-w-0 flex-1 flex-col gap-1 py-1 hover:underline-offset-4">
          <span className="truncate font-semibold">{p.title}</span>
          <span className="text-sm text-text-2">
            {p.trackCount}곡 · {dateFmt.format(new Date(p.updatedAt))}
          </span>
        </Link>
        <IconButton label={`${p.title} 이름 바꾸기`} onClick={props.onRename}>
          <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
        </IconButton>
        <IconButton label={`${p.title} 복제`} onClick={props.onDuplicate}>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a1 1 0 0 1 1-1h10" />
        </IconButton>
        <IconButton label={`${p.title} 삭제`} onClick={props.onDelete}>
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
        </IconButton>
      </div>
    </li>
  );
}
