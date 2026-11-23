// API 테스트 전: 테스트 DB 에 마이그레이션 적용 + 모든 데이터 비우기, 테스트 저장소 폴더 비우기
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { repoRoot, testDatabaseUrl, TEST_STORAGE_DIR } from './test-db.ts';

export default async function setup() {
  const url = testDatabaseUrl();
  const env = { ...process.env, DATABASE_URL: url };

  // migrate deploy: DB 가 없으면 만들고, 아직 적용 안 된 마이그레이션만 적용
  execFileSync(process.execPath, [path.join(repoRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: repoRoot,
    env,
    stdio: 'pipe'
  });

  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    // users 를 지우면 sessions/projects/tracks/... 가 CASCADE 로 함께 지워진다
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" CASCADE');
  } finally {
    await prisma.$disconnect();
  }

  await fs.rm(path.join(repoRoot, TEST_STORAGE_DIR), { recursive: true, force: true });
}
