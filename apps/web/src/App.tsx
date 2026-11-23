import { BrowserRouter, Link, Route, Routes } from 'react-router';
import { AuthProvider } from './features/auth/AuthContext.tsx';
import { GuestOnly, RequireAuth } from './features/auth/RouteGuards.tsx';
import { LoginPage } from './features/auth/LoginPage.tsx';
import { SignupPage } from './features/auth/SignupPage.tsx';
import { DashboardPage } from './features/projects/DashboardPage.tsx';
import { DevPage } from './features/status/DevPage.tsx';

function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="font-display text-2xl font-bold">페이지를 찾을 수 없어요</h1>
      <Link to="/" className="text-accent hover:underline">
        내 프로젝트로 가기
      </Link>
    </main>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<GuestOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="/" element={<DashboardPage />} />
          </Route>
          <Route path="/dev" element={<DevPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
