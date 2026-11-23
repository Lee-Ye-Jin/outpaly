import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './AuthContext.tsx';

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
      <span className="size-6 animate-spin rounded-full border-2 border-line-strong border-t-accent" aria-hidden />
      <span className="sr-only">불러오는 중</span>
    </div>
  );
}

/** 로그인해야 들어갈 수 있는 화면. 아니면 /login 으로 보내고, 로그인 후 원래 주소로 돌아온다 */
export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') return <FullPageSpinner />;
  if (state.status === 'guest') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

/** 로그인한 사용자가 /login, /signup 에 오면 대시보드로 */
export function GuestOnly() {
  const { state } = useAuth();
  if (state.status === 'loading') return <FullPageSpinner />;
  if (state.status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}
