import type { ReactNode } from 'react';
import { Logo } from '../../components/Logo.tsx';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo />
          <p className="text-sm text-text-3">Create. Mix. Play.</p>
        </div>
        <main className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
          <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 mb-6 text-sm text-text-2">{subtitle}</p>
          {children}
        </main>
      </div>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
      {message}
    </p>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 min-h-11 rounded-lg bg-accent font-semibold text-accent-ink transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? '잠시만요…' : children}
    </button>
  );
}
