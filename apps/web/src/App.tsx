import { HealthCard } from './features/status/HealthCard.tsx';
import { FramePreview } from './features/editor/FramePreview.tsx';

export function App() {
  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-3 border-b border-line bg-[#111115] px-6 py-3">
        <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
          <rect width="28" height="28" rx="7" fill="#FF7A45" />
          <path d="M11 8.5v11l9-5.5z" fill="#0D0D10" />
        </svg>
        <span className="font-display text-lg font-bold">OutPaly</span>
        <span className="text-sm text-text-3">Playlist Video Studio</span>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Create. Mix. Play.</h1>
          <p className="mt-2 text-text-2">Phase 1 · 개발 환경과 기본 구조</p>
        </div>
        <HealthCard />
        <FramePreview />
      </main>
    </div>
  );
}
