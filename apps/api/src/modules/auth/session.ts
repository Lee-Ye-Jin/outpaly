// 서버 세션. 브라우저에는 무작위 토큰만 HttpOnly 쿠키로 주고, DB 에는 그 토큰의 SHA-256 해시를 저장한다.
// DB 가 유출돼도 해시로는 세션을 가로챌 수 없다.

import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import { env } from '../../config/env.ts';
import { prisma } from '../../lib/prisma.ts';

export const SESSION_COOKIE = 'op_session';
const DAY = 24 * 60 * 60 * 1000;
const SESSION_TTL = 30 * DAY;
/** 만료까지 이보다 적게 남았으면 연장 (자주 쓰는 사용자는 계속 로그인 상태) */
const RENEW_WITHIN = 15 * DAY;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function cookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt
  };
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL);
  await prisma.session.create({ data: { id: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function findValidSession(token: string) {
  const session = await prisma.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: { select: { id: true, email: true, displayName: true } } }
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session;
}

/** 만료가 가까우면 연장하고 새 만료 시각을 돌려준다. 연장하지 않았으면 null */
export async function renewIfNeeded(sessionId: string, expiresAt: Date): Promise<Date | null> {
  if (expiresAt.getTime() - Date.now() > RENEW_WITHIN) return null;
  const next = new Date(Date.now() + SESSION_TTL);
  await prisma.session.update({ where: { id: sessionId }, data: { expiresAt: next } });
  return next;
}

export async function destroySession(token: string) {
  await prisma.session.deleteMany({ where: { id: hashToken(token) } });
}

export async function purgeExpiredSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId, expiresAt: { lte: new Date() } } });
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

export function clearSessionCookie(res: Response) {
  const { expires: _expires, ...opts } = cookieOptions(new Date(0));
  res.clearCookie(SESSION_COOKIE, opts);
}
