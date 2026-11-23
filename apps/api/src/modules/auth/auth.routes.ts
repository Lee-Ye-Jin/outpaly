import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Prisma } from '@prisma/client';
import { LoginInput, RegisterInput, type AuthResponse, type AuthUser } from '@outpaly/shared';
import { env } from '../../config/env.ts';
import { prisma } from '../../lib/prisma.ts';
import { parseBody } from '../../lib/validate.ts';
import { HttpError } from '../../middleware/error.ts';
import { currentUser, requireAuth } from '../../middleware/auth.ts';
import { getDummyHash, hashPassword, verifyPassword } from './password.ts';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  purgeExpiredSessions,
  setSessionCookie
} from './session.ts';

export const authRouter = Router();

// 비밀번호 대입 공격 방지: IP 당 15분에 20회
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'TOO_MANY_REQUESTS', message: '시도가 너무 많아요. 잠시 후 다시 시도해 주세요.' }
    });
  }
});

const toAuthUser = (u: { id: string; email: string; displayName: string | null }): AuthUser => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName
});

authRouter.post('/register', authLimiter, async (req, res) => {
  const input = parseBody(RegisterInput, req.body);
  const passwordHash = await hashPassword(input.password);

  let user;
  try {
    user = await prisma.user.create({
      data: { email: input.email, passwordHash, displayName: input.displayName ?? null }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new HttpError(409, 'EMAIL_TAKEN', '이미 가입된 이메일이에요.', 'email');
    }
    throw e;
  }

  const { token, expiresAt } = await createSession(user.id);
  setSessionCookie(res, token, expiresAt);
  const body: AuthResponse = { user: toAuthUser(user) };
  res.status(201).json(body);
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const input = parseBody(LoginInput, req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // 없는 이메일이어도 해시 비교를 해서 응답 시간으로 가입 여부를 알 수 없게 한다
  const ok = await verifyPassword(user?.passwordHash ?? (await getDummyHash()), input.password);
  if (!user || !ok) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호가 올바르지 않아요.');
  }

  // 기존 세션 토큰을 재사용하지 않고 새로 발급 (세션 고정 공격 방지)
  if (req.sessionToken) await destroySession(req.sessionToken);
  await purgeExpiredSessions(user.id);
  const { token, expiresAt } = await createSession(user.id);
  setSessionCookie(res, token, expiresAt);
  const body: AuthResponse = { user: toAuthUser(user) };
  res.json(body);
});

authRouter.post('/logout', async (req, res) => {
  if (req.sessionToken) await destroySession(req.sessionToken);
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  const body: AuthResponse = { user: currentUser(req) };
  res.json(body);
});
