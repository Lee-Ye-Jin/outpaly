import { defineConfig } from 'vitest/config';
import { testDatabaseUrl, TEST_STORAGE_DIR } from './apps/api/test/test-db.ts';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/src/**/*.test.ts', 'apps/web/src/**/*.test.ts']
        }
      },
      {
        test: {
          name: 'api',
          include: ['apps/api/src/**/*.test.ts', 'apps/worker/src/**/*.test.ts'],
          // 실제 ffmpeg 로 영상을 만드는 테스트가 있어 넉넉하게
          testTimeout: 60_000,
          globalSetup: ['apps/api/test/global-setup.ts'],
          // 테스트 파일들이 같은 DB 를 쓰므로 순서대로 실행
          fileParallelism: false,
          env: {
            NODE_ENV: 'test',
            DATABASE_URL: testDatabaseUrl(),
            STORAGE_DIR: TEST_STORAGE_DIR
          }
        }
      }
    ]
  }
});
