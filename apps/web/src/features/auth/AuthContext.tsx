import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthUser, LoginInput, RegisterInput } from '@outpaly/shared';
import { ApiRequestError, authApi } from '../../services/api.ts';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'guest'; user: null };

interface AuthContextValue {
  state: AuthState;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  // 새로고침해도 로그인 유지: 세션 쿠키로 /me 확인
  useEffect(() => {
    const ctrl = new AbortController();
    authApi
      .me(ctrl.signal)
      .then(({ user }) => setState({ status: 'authenticated', user }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        if (!(e instanceof ApiRequestError && e.status === 401)) console.warn('세션 확인 실패', e);
        setState({ status: 'guest', user: null });
      });
    return () => ctrl.abort();
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const { user } = await authApi.login(input);
    setState({ status: 'authenticated', user });
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const { user } = await authApi.register(input);
    setState({ status: 'authenticated', user });
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setState({ status: 'guest', user: null });
    }
  }, []);

  const value = useMemo(() => ({ state, login, register, logout }), [state, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 는 AuthProvider 안에서만 쓸 수 있어요.');
  return ctx;
}
