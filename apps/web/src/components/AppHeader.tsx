import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../features/auth/AuthContext.tsx';
import { Logo } from './Logo.tsx';

export function AppHeader() {
  const { state, logout } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const user = state.user;

  async function onLogout() {
    setPending(true);
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-line bg-[#111115] px-4 py-2.5 sm:px-6">
      <Link to="/" className="flex min-h-11 items-center" aria-label="OutPaly 내 프로젝트">
        <Logo withTagline />
      </Link>
      <div className="flex-1" />
      {user && (
        <>
          <span className="hidden max-w-[16rem] truncate text-sm text-text-2 sm:inline" title={user.email}>
            {user.displayName ?? user.email}
          </span>
          <button
            type="button"
            onClick={onLogout}
            disabled={pending}
            className="min-h-10 rounded-lg border border-line-strong px-3 text-sm hover:bg-panel-2 disabled:opacity-60"
          >
            로그아웃
          </button>
        </>
      )}
    </header>
  );
}
