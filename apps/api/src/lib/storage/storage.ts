// 파일 저장소 인터페이스. 지금은 로컬 디스크(LocalStorage), 배포 때 S3 구현으로 바꾼다.
// 업로드는 S3 presigned URL 과 같은 흐름: 서버가 "업로드 주소"를 발급 → 브라우저가 그 주소로 직접 PUT.

import type { Response } from 'express';

export interface UploadTargetSpec {
  key: string;
  contentType: string;
  maxBytes: number;
  /** 업로드 주소 유효 시간 (초) */
  expiresIn: number;
}

export interface UploadTargetResult {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface FileStorage {
  createUploadTarget(spec: UploadTargetSpec): Promise<UploadTargetResult>;
  /** 없으면 null */
  stat(key: string): Promise<{ size: number } | null>;
  /** 메타데이터 분석·렌더링용 로컬 경로. S3 구현에서는 임시 파일로 내려받아 돌려준다 */
  withLocalFile<T>(key: string, fn: (path: string) => Promise<T>): Promise<T>;
  /** 브라우저 재생용. Range 요청(구간 탐색)을 지원해야 한다 */
  sendFile(res: Response, key: string, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/** 사용자별 키. 다른 사용자의 키를 쓰지 못하게 complete 에서 접두사를 확인한다 */
export function userPrefix(userId: string): string {
  return `users/${userId}/`;
}
