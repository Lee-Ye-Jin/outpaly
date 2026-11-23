import { AppHeader } from '../../components/AppHeader.tsx';
import { FramePreview } from '../editor/FramePreview.tsx';
import { HealthCard } from './HealthCard.tsx';

/** 개발용 점검 화면 (/dev). 로그인 없이 볼 수 있다 */
export function DevPage() {
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">개발 도구</h1>
        <HealthCard />
        <FramePreview />
      </main>
    </div>
  );
}
