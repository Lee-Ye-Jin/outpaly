import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { PASSWORD_MIN, RegisterInput } from '@outpaly/shared';
import { TextField } from '../../components/TextField.tsx';
import { useAuth } from './AuthContext.tsx';
import { AuthLayout, FormError, SubmitButton } from './AuthLayout.tsx';
import { fieldErrorsFrom, splitServerError, type FieldErrors } from './form-errors.ts';

export function SignupPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = RegisterInput.safeParse({ email, password, displayName });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      await register({ email, password, displayName });
      navigate(from, { replace: true });
    } catch (err) {
      const { fields, form } = splitServerError(err);
      setErrors(fields);
      setFormError(form);
      setPending(false);
    }
  }

  return (
    <AuthLayout title="회원가입" subtitle="음악을 모아 나만의 플레이리스트 영상을 만들어요.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError message={formError} />
        <TextField
          label="이름 (선택)"
          autoComplete="nickname"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          error={errors.displayName}
          autoFocus
        />
        <TextField
          label="이메일"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <TextField
          label="비밀번호"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          hint={`${PASSWORD_MIN}자 이상`}
        />
        <SubmitButton pending={pending}>가입하기</SubmitButton>
      </form>
      <p className="mt-6 text-center text-sm text-text-2">
        이미 계정이 있나요?{' '}
        <Link to="/login" state={location.state} className="font-medium text-accent hover:underline">
          로그인
        </Link>
      </p>
    </AuthLayout>
  );
}
