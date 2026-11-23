import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// 저장소 루트의 .env 를 읽는다 (Prisma CLI 와 같은 파일)
const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env');
try {
  process.loadEnvFile(rootEnv);
} catch {
  // .env 가 없으면 실제 환경변수만 사용 (배포 환경)
}

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL 이 필요합니다. .env.example 을 .env 로 복사하세요.'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  /** 프록시 홉 수 (예: "1"). 로컬 개발에서는 비워 둔다 */
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((v) => (v ? (/^\d+$/.test(v) ? Number(v) : v) : undefined))
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error('환경변수 오류:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
