// 로컬 디스크 저장소 (개발용). 업로드 주소는 HMAC 서명 토큰이 붙은 API 경로다.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import { HttpError } from '../../middleware/error.ts';
import type { FileStorage, UploadTargetResult, UploadTargetSpec } from './storage.ts';

interface UploadToken {
  /** key */
  k: string;
  /** content type */
  m: string;
  /** max bytes */
  s: number;
  /** expires (ms) */
  e: number;
}

export class LocalStorage implements FileStorage {
  constructor(
    private readonly root: string,
    private readonly secret: string,
    /** 업로드 PUT 을 받는 API 경로 (예: /api/storage/upload) */
    private readonly uploadBasePath: string
  ) {}

  /** key → 절대 경로. root 밖으로 나가는 키(../)는 거절 */
  resolve(key: string): string {
    const abs = path.resolve(this.root, key);
    if (!abs.startsWith(path.resolve(this.root) + path.sep)) {
      throw new HttpError(400, 'BAD_KEY', '잘못된 파일 키예요.');
    }
    return abs;
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  async createUploadTarget(spec: UploadTargetSpec): Promise<UploadTargetResult> {
    this.resolve(spec.key); // 키 검사
    const expiresAt = new Date(Date.now() + spec.expiresIn * 1000);
    const body: UploadToken = { k: spec.key, m: spec.contentType, s: spec.maxBytes, e: expiresAt.getTime() };
    const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
    const token = `${payload}.${this.sign(payload)}`;
    return {
      url: `${this.uploadBasePath}/${token}`,
      method: 'PUT',
      headers: { 'Content-Type': spec.contentType },
      expiresAt
    };
  }

  verifyToken(token: string): UploadToken {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) throw new HttpError(403, 'BAD_UPLOAD_TOKEN', '업로드 주소가 올바르지 않아요.');
    const expected = Buffer.from(this.sign(payload));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new HttpError(403, 'BAD_UPLOAD_TOKEN', '업로드 주소가 올바르지 않아요.');
    }
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as UploadToken;
    if (Date.now() > body.e) throw new HttpError(403, 'UPLOAD_EXPIRED', '업로드 주소가 만료됐어요. 다시 시도해 주세요.');
    return body;
  }

  /** PUT 본문을 디스크에 쓴다. 크기 제한을 넘으면 중단하고 413 */
  async receiveUpload(req: Request, token: string): Promise<{ key: string; size: number }> {
    const t = this.verifyToken(token);
    const contentType = (req.get('content-type') ?? '').split(';')[0]!.trim();
    if (contentType !== t.m) {
      throw new HttpError(400, 'CONTENT_TYPE_MISMATCH', '업로드 형식이 발급받은 형식과 달라요.');
    }
    const declared = Number(req.get('content-length'));
    if (Number.isFinite(declared) && declared > t.s) {
      throw new HttpError(413, 'TOO_LARGE', '파일이 너무 커요.');
    }

    const dest = this.resolve(t.k);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.part-${randomBytes(6).toString('hex')}`;
    let size = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        size += chunk.length;
        if (size > t.s) cb(new HttpError(413, 'TOO_LARGE', '파일이 너무 커요.'));
        else cb(null, chunk);
      }
    });
    try {
      await pipeline(req, limiter, createWriteStream(tmp));
      await fs.rename(tmp, dest);
    } catch (e) {
      await fs.rm(tmp, { force: true });
      throw e;
    }
    return { key: t.k, size };
  }

  async stat(key: string) {
    try {
      const s = await fs.stat(this.resolve(key));
      return s.isFile() ? { size: s.size } : null;
    } catch {
      return null;
    }
  }

  async withLocalFile<T>(key: string, fn: (p: string) => Promise<T>): Promise<T> {
    return fn(this.resolve(key));
  }

  sendFile(res: Response, key: string, contentType: string): Promise<void> {
    const abs = this.resolve(key);
    return new Promise((resolve, reject) => {
      // dotfiles: 'allow' — 저장 폴더가 .storage 라서 기본값(ignore)이면 404 가 된다.
      // abs 는 서버가 만든 키를 resolve() 로 root 안인지 확인한 경로라 안전하다.
      const opts = { dotfiles: 'allow' as const, headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=3600' } };
      res.sendFile(abs, opts, (err) => {
        if (err && !res.headersSent) reject(new HttpError(404, 'FILE_NOT_FOUND', '파일을 찾을 수 없어요.'));
        else resolve();
      });
    });
  }

  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}
