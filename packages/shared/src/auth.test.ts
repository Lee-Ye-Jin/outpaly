import { describe, expect, it } from 'vitest';
import { LoginInput, RegisterInput } from './auth.ts';

describe('auth 입력 검증', () => {
  it('이메일을 공백 제거·소문자로 정규화한다', () => {
    const r = RegisterInput.parse({ email: '  Yejin@Example.COM ', password: 'abcdefgh' });
    expect(r.email).toBe('yejin@example.com');
    expect(r.displayName).toBeUndefined();
  });

  it('짧은 비밀번호와 잘못된 이메일을 거절한다', () => {
    expect(RegisterInput.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(false);
    expect(RegisterInput.safeParse({ email: 'not-an-email', password: 'abcdefgh' }).success).toBe(false);
  });

  it('빈 이메일은 형식 오류가 아니라 "입력해 주세요"로 안내한다', () => {
    const r = LoginInput.safeParse({ email: '   ', password: 'x' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('이메일을 입력해 주세요.');
  });

  it('빈 이름은 undefined 로 바꾼다', () => {
    expect(RegisterInput.parse({ email: 'a@b.co', password: 'abcdefgh', displayName: '   ' }).displayName).toBeUndefined();
  });

  it('로그인은 비밀번호 길이 규칙을 강제하지 않는다 (기존 사용자 보호)', () => {
    expect(LoginInput.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });
});
