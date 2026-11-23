import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

// 저장소 루트의 .env 를 읽는다 (Prisma CLI 와 같은 파일). 이미 있는 환경변수는 덮어쓰지 않는다.
try {
  process.loadEnvFile(path.join(repoRoot, '.env'));
} catch {
  // .env 가 없으면 실제 환경변수만 사용 (배포 환경)
}

const Env = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL 이 필요합니다. .env.example 을 .env 로 복사하세요.'),
    API_PORT: z.coerce.number().int().positive().default(4000),
    WEB_ORIGIN: z.url().default('http://localhost:5173'),
    /** 프록시 홉 수 (예: "1"). 로컬 개발에서는 비워 둔다 */
    TRUST_PROXY: z
      .string()
      .optional()
      .transform((v) => (v ? (/^\d+$/.test(v) ? Number(v) : v) : undefined)),
    /** 로컬 파일 저장 위치 */
    STORAGE_DIR: z
      .string()
      .optional()
      .transform((v) => path.resolve(repoRoot, v || '.storage')),
    /** 업로드 주소 서명 키. 프로덕션에서는 필수 (32자 이상) */
    STORAGE_SECRET: z.string().min(32).optional()
  })
  .transform((e, ctx) => {
    if (!e.STORAGE_SECRET && e.NODE_ENV === 'production') {
      ctx.addIssue({ code: 'custom', path: ['STORAGE_SECRET'], message: '프로덕션에서는 STORAGE_SECRET 이 필요합니다.' });
      return z.NEVER;
    }
    // 개발: 실행할 때마다 새 키 (서버를 재시작하면 진행 중이던 업로드 주소는 무효가 된다)
    return { ...e, STORAGE_SECRET: e.STORAGE_SECRET ?? randomBytes(32).toString('hex') };
  });

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error('환경변수 오류:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
