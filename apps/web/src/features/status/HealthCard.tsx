import { useEffect, useState } from 'react';
import type { HealthResponse } from '@outpaly/shared';
import { fetchHealth } from '../../services/api.ts';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; data: HealthResponse }
  | { kind: 'error'; message: string };

function Row({ label, ok, detail }: { label: string; ok: boolean | null; detail: string }) {
  const dot = ok === null ? 'bg-text-3' : ok ? 'bg-ok' : 'bg-warn';
  return (
    <div className="flex items-center gap-3 py-2">
      <span aria-hidden className={`size-2.5 rounded-full ${dot}`} />
      <span className="w-24 text-sm text-text-2">{label}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{detail}</span>
    </div>
  );
}

export function HealthCard() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ kind: 'loading' });
    fetchHealth(ctrl.signal)
      .then((data) => setState({ kind: 'ok', data }))
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      });
    return () => ctrl.abort();
  }, [tick]);

  const api = state.kind === 'ok' ? true : state.kind === 'error' ? false : null;
  const db = state.kind === 'ok' ? state.data.db : null;

  return (
    <section className="rounded-2xl border border-line bg-panel p-6" aria-labelledby="health-title" aria-live="polite">
      <div className="mb-3 flex items-center gap-3">
        <h2 id="health-title" className="flex-1 text-base font-semibold">
          개발 환경 상태
        </h2>
        <button
          type="button"
          onClick={() => setTick((n) => n + 1)}
          className="min-h-10 rounded-lg border border-line-strong px-3 text-sm hover:bg-panel-2"
        >
          다시 확인
        </button>
      </div>
      <Row
        label="API 서버"
        ok={api}
        detail={state.kind === 'loading' ? '확인 중…' : state.kind === 'error' ? state.message : 'Express 응답 정상'}
      />
      <Row
        label="PostgreSQL"
        ok={db ? db.ok : null}
        detail={
          !db ? '—' : db.ok ? `연결됨 · ${db.latencyMs}ms` : `연결 실패 · ${db.error ?? ''}`
        }
      />
      <Row
        label="데이터"
        ok={state.kind === 'ok' && state.data.counts ? true : null}
        detail={
          state.kind === 'ok' && state.data.counts
            ? `사용자 ${state.data.counts.users}명 · 프로젝트 ${state.data.counts.projects}개`
            : '—'
        }
      />
    </section>
  );
}
