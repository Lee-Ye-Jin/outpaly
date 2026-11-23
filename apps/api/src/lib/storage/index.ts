import { env } from '../../config/env.ts';
import { LocalStorage } from './local.ts';

export * from './storage.ts';

export const UPLOAD_BASE_PATH = '/api/storage/upload';

// 배포 시 STORAGE_DRIVER=s3 로 S3 구현을 고르게 된다 (Phase 8)
export const storage = new LocalStorage(env.STORAGE_DIR, env.STORAGE_SECRET, UPLOAD_BASE_PATH);
