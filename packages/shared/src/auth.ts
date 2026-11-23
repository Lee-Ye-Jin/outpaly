// 회원가입·로그인 입력 검증. 웹 폼과 API 가 같은 규칙을 쓴다.

import { z } from 'zod';

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const Email = z
  .string({ error: '이메일을 입력해 주세요.' })
  .trim()
  .min(1, { error: '이메일을 입력해 주세요.' })
  .toLowerCase()
  .pipe(z.email({ error: '올바른 이메일 형식이 아니에요.' }).max(254, { error: '이메일이 너무 길어요.' }));

export const NewPassword = z
  .string({ error: '비밀번호를 입력해 주세요.' })
  .min(PASSWORD_MIN, { error: `비밀번호는 ${PASSWORD_MIN}자 이상이어야 해요.` })
  .max(PASSWORD_MAX, { error: `비밀번호는 ${PASSWORD_MAX}자 이하여야 해요.` });

export const RegisterInput = z.object({
  email: Email,
  password: NewPassword,
  displayName: z
    .string()
    .trim()
    .max(40, { error: '이름은 40자 이하여야 해요.' })
    .optional()
    .transform((v) => (v ? v : undefined))
});
export type RegisterInput = z.input<typeof RegisterInput>;

export const LoginInput = z.object({
  email: Email,
  password: z
    .string({ error: '비밀번호를 입력해 주세요.' })
    .min(1, { error: '비밀번호를 입력해 주세요.' })
    .max(PASSWORD_MAX, { error: '비밀번호가 올바르지 않아요.' })
});
export type LoginInput = z.input<typeof LoginInput>;

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface AuthResponse {
  user: AuthUser;
}
