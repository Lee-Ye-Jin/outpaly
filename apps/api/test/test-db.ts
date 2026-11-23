import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * 테스트 전용 DB 주소. TEST_DATABASE_URL 이 있으면 그것을, 없으면 DATABASE_URL 의 DB 이름 뒤에 _test 를 붙인다.
 * DB 이름이 _test 로 끝나지 않으면 예외 — 개발 DB 를 지우는 사고를 막는다.
 */
export function testDatabaseUrl(): string {
  try {
    process.loadEnvFile(path.join(root, '.env'));
  } catch {
    // CI 등에서는 환경변수로만 받는다
  }
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const base = process.env.DATABASE_URL;
    if (!base) throw new Error('DATABASE_URL 또는 TEST_DATABASE_URL 이 필요해요.');
    const u = new URL(base);
    u.pathname = `${u.pathname.replace(/_test$/, '')}_test`;
    url = u.toString();
  }
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(`테스트 DB 이름은 _test 로 끝나야 해요 (현재: ${dbName}).`);
  }
  return url;
}

/** 테스트가 업로드하는 파일 위치 (개발용 .storage 와 분리) */
export const TEST_STORAGE_DIR = '.storage-test';

export { root as repoRoot };
