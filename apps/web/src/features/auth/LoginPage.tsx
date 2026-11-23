import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { LoginInput } from '@outpaly/shared';
import { TextField } from '../../components/TextField.tsx';
import { useAuth } from './AuthContext.tsx';
import { AuthLayout, FormError, SubmitButton } from './AuthLayout.tsx';
import { fieldErrorsFrom, splitServerError, type FieldErrors } from './form-errors.ts';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = LoginInput.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await login(parsed.data);
      navigate(from, { replace: true });
    } catch (err) {
      const { fields, form } = splitServerError(err);
      setErrors(fields);
      setFormError(form);
      setPending(false);
    }
  }

  return (
    <AuthLayout title="로그인" subtitle="내 플레이리스트 프로젝트를 이어서 만들어요.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError message={formError} />
        <TextField
          label="이메일"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          autoFocus
        />
        <TextField
          label="비밀번호"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <SubmitButton pending={pending}>로그인</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-text-2">
        처음이신가요?{' '}
        <Link to="/signup" state={location.state} className="font-medium text-accent hover:underline">
          회원가입
        </Link>
      </p>
    </AuthLayout>
  );
}
