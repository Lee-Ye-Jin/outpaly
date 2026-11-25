// API 가 쓰는 저장소: 공통 FileStore(@outpaly/storage) + 브라우저 업로드 주소 발급 + 브라우저로 보내기.
// 업로드는 S3 presigned URL 과 같은 흐름: 서버가 "업로드 주소"를 발급 → 브라우저가 그 주소로 직접 PUT.

import type { Response } from 'express';
import type { FileStore } from '@outpaly/storage';

export { userPrefix, trackKeyPrefix, renderKey } from '@outpaly/storage';

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

export interface SendOptions {
  contentType: string;
  /** 있으면 다운로드(Content-Disposition: attachment)로 보낸다 */
  downloadName?: string;
}

export interface ApiStorage extends FileStore {
  createUploadTarget(spec: UploadTargetSpec): Promise<UploadTargetResult>;
  /** 브라우저 재생·다운로드용. Range 요청(구간 탐색)을 지원해야 한다 */
  sendFile(res: Response, key: string, opts: SendOptions): Promise<void>;
}
