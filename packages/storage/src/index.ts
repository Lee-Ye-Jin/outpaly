// API 와 렌더링 Worker 가 함께 쓰는 파일 저장소. 지금은 로컬 디스크, 배포 때 S3 구현을 추가한다.

import fs from 'node:fs/promises';
import path from 'node:path';

export interface FileStore {
  /** 없으면 null */
  stat(key: string): Promise<{ size: number } | null>;
  /** 로컬 경로로 작업. S3 구현에서는 임시 파일로 내려받아 넘기고 끝나면 지운다 */
  withLocalFile<T>(key: string, fn: (path: string) => Promise<T>): Promise<T>;
  /** 로컬 파일을 key 로 저장 (렌더 결과 업로드) */
  putFile(localPath: string, key: string, contentType: string): Promise<{ size: number }>;
  delete(key: string): Promise<void>;
}

export class BadKeyError extends Error {}

/** 사용자별 키. 다른 사용자의 키를 쓰지 못하게 접두사를 확인한다 */
export const userPrefix = (userId: string) => `users/${userId}/`;
export const trackKeyPrefix = (userId: string) => `${userPrefix(userId)}tracks/`;
export const renderKey = (userId: string, jobId: string) => `${userPrefix(userId)}renders/${jobId}.mp4`;

export class LocalFileStore implements FileStore {
  constructor(readonly root: string) {}

  /** key → 절대 경로. root 밖으로 나가는 키(../)는 거절 */
  resolve(key: string): string {
    const abs = path.resolve(this.root, key);
    if (!abs.startsWith(path.resolve(this.root) + path.sep)) throw new BadKeyError(`잘못된 파일 키: ${key}`);
    return abs;
  }

  async stat(key: string) {
    try {
      const s = await fs.stat(this.resolve(key));
      return s.isFile() ? { size: s.size } : null;
    } catch (e) {
      if (e instanceof BadKeyError) throw e;
      return null;
    }
  }

  async withLocalFile<T>(key: string, fn: (p: string) => Promise<T>): Promise<T> {
    return fn(this.resolve(key));
  }

  async putFile(localPath: string, key: string, _contentType: string) {
    const dest = this.resolve(key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    // 같은 디스크면 rename 이 빠르지만, 작업 폴더가 다른 드라이브일 수 있어 복사 후 원본은 호출한 쪽이 정리
    const tmp = `${dest}.part-${process.pid}-${Date.now()}`;
    await fs.copyFile(localPath, tmp);
    await fs.rename(tmp, dest);
    const { size } = await fs.stat(dest);
    return { size };
  }

  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}
