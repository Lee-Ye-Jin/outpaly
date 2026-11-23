import { hash, verify } from '@node-rs/argon2';

// OWASP 권장 argon2id 설정 (m=19MiB, t=2, p=1)
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // 형식이 잘못된 해시 (예: 시드 사용자의 '!') → 로그인 불가
    return false;
  }
}

// 없는 이메일로 로그인할 때도 같은 시간이 걸리도록 비교에 쓰는 해시
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('outpaly-timing-equalizer');
  return dummyHash;
}
