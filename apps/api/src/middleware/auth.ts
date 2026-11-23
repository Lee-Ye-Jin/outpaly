import type { RequestHandler } from 'express';
import { HttpError } from './error.ts';
import { findValidSession, renewIfNeeded, SESSION_COOKIE, setSessionCookie } from '../modules/auth/session.ts';

/** 모든 /api 요청에서 세션 쿠키를 읽어 req.user 를 채운다 (없으면 그대로 통과) */
export const loadSession: RequestHandler = async (req, _res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || token.length === 0 || token.length > 200) return next();

  const session = await findValidSession(token);
  if (!session) return next();

  req.user = session.user;
  req.sessionToken = token;

  const renewed = await renewIfNeeded(session.id, session.expiresAt);
  if (renewed) setSessionCookie(_res, token, renewed);
  next();
};

/** 로그인이 필요한 라우트 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) throw new HttpError(401, 'UNAUTHENTICATED', '로그인이 필요해요.');
  next();
};

/** req.user 가 있다고 확정된 핸들러 안에서 쓴다 */
export function currentUser(req: Express.Request) {
  if (!req.user) throw new HttpError(401, 'UNAUTHENTICATED', '로그인이 필요해요.');
  return req.user;
}
