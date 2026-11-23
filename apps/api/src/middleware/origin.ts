import type { RequestHandler } from 'express';
import { env } from '../config/env.ts';
import { HttpError } from './error.ts';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF 방어 (SameSite=Lax 쿠키에 더해).
 * 데이터를 바꾸는 요청에 다른 사이트의 Origin 이 붙어 있으면 거절한다.
 * Origin 이 없는 요청(서버 간 호출, curl)은 쿠키를 자동으로 싣지 않으므로 통과시킨다.
 */
export const checkOrigin: RequestHandler = (req, _res, next) => {
  if (SAFE.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== env.WEB_ORIGIN) {
    throw new HttpError(403, 'BAD_ORIGIN', '허용되지 않은 출처의 요청이에요.');
  }
  next();
};
