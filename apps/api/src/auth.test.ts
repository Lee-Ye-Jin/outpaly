// Phase 2 완료 기준: 가입·로그인·로그아웃·인증 유지, 그리고 사용자 A 와 B 가 서로의 프로젝트에 접근할 수 없어야 한다.

import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.ts';
import { prisma } from './lib/prisma.ts';
import { SESSION_COOKIE, hashToken } from './modules/auth/session.ts';

const app = createApp();
const ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const run = Date.now().toString(36);
const emailA = `a-${run}@test.outpaly`;
const emailB = `b-${run}@test.outpaly`;
const PW = 'correct horse battery';

afterAll(() => prisma.$disconnect());

function sessionCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
}

async function signup(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').set('Origin', ORIGIN).send({ email, password: PW });
  expect(res.status).toBe(201);
  return agent;
}

describe('회원가입', () => {
  it('가입하면 201 과 HttpOnly·SameSite=Lax 세션 쿠키를 준다', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: `  New-${run}@Test.Outpaly `, password: PW, displayName: '예진' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: `new-${run}@test.outpaly`, displayName: '예진' });
    expect(res.body.user).not.toHaveProperty('passwordHash');

    const cookie = sessionCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('비밀번호는 argon2id 해시로 저장되고, 세션 토큰은 원문이 아니라 해시로 저장된다', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: `hash-${run}@test.outpaly`, password: PW });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: `hash-${run}@test.outpaly` } });
    expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(user.passwordHash).not.toContain(PW);

    const token = sessionCookie(res)!.split(';')[0]!.split('=')[1]!;
    expect(await prisma.session.findUnique({ where: { id: token } })).toBeNull();
    expect(await prisma.session.findUnique({ where: { id: hashToken(token) } })).not.toBeNull();
  });

  it('같은 이메일로 다시 가입하면 409', async () => {
    await signup(`dup-${run}@test.outpaly`);
    const res = await request(app).post('/api/auth/register').send({ email: `DUP-${run}@test.outpaly`, password: PW });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'EMAIL_TAKEN', field: 'email' });
  });

  it('짧은 비밀번호는 400 과 어느 칸이 틀렸는지 알려준다', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: `short-${run}@test.outpaly`, password: '1234' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION', field: 'password' });
  });
});

describe('로그인 · 인증 유지 · 로그아웃', () => {
  it('로그인 → /me → 로그아웃 → /me 401', async () => {
    await signup(emailA);
    const agent = request.agent(app);

    expect((await agent.get('/api/auth/me')).status).toBe(401);

    const login = await agent.post('/api/auth/login').send({ email: emailA.toUpperCase(), password: PW });
    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe(emailA);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(emailA);

    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('틀린 비밀번호와 없는 이메일은 같은 401 메시지', async () => {
    const wrong = await request(app).post('/api/auth/login').send({ email: emailA, password: 'wrong password' });
    const none = await request(app).post('/api/auth/login').send({ email: `nobody-${run}@test.outpaly`, password: PW });
    expect(wrong.status).toBe(401);
    expect(none.status).toBe(401);
    expect(wrong.body).toEqual(none.body);
  });

  it('로그아웃한 세션 토큰은 다시 쓸 수 없다', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: emailA, password: PW });
    const cookie = sessionCookie(res)!.split(';')[0]!;
    await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('만료된 세션은 거절하고 DB 에서 지운다', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: emailA, password: PW });
    const cookie = sessionCookie(res)!.split(';')[0]!;
    const id = hashToken(cookie.split('=')[1]!);
    await prisma.session.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
    expect(await prisma.session.findUnique({ where: { id } })).toBeNull();
  });

  it('다른 사이트 Origin 의 POST 는 403 (CSRF 방어)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: emailA, password: PW });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('BAD_ORIGIN');
  });
});

describe('프로젝트 접근 권한 (사용자 A ↔ B)', () => {
  it('A 의 프로젝트를 B 는 목록에서도, 상세로도 볼 수 없다', async () => {
    const a = request.agent(app);
    await a.post('/api/auth/login').send({ email: emailA, password: PW }).expect(200);
    const b = await signup(emailB);

    const created = await a.post('/api/projects').send({ title: 'A 의 플레이리스트' });
    expect(created.status).toBe(201);
    const projectId: string = created.body.project.id;
    expect(created.body.project.settings.titleLayer.text).toBe('A 의 플레이리스트');

    // A 는 볼 수 있다
    expect((await a.get(`/api/projects/${projectId}`)).status).toBe(200);
    expect((await a.get('/api/projects')).body.projects.map((p: { id: string }) => p.id)).toContain(projectId);

    // B 는 볼 수 없다 — 403 이 아니라 404 (존재 여부를 노출하지 않음)
    const bGet = await b.get(`/api/projects/${projectId}`);
    expect(bGet.status).toBe(404);
    expect(bGet.body.error.code).toBe('PROJECT_NOT_FOUND');
    expect((await b.get('/api/projects')).body.projects).toEqual([]);
  });

  it('로그인하지 않으면 프로젝트 API 는 401', async () => {
    expect((await request(app).get('/api/projects')).status).toBe(401);
    expect((await request(app).post('/api/projects').send({ title: 'x' })).status).toBe(401);
  });

  it('잘못된 형식의 id 는 500 이 아니라 404', async () => {
    const a = request.agent(app);
    await a.post('/api/auth/login').send({ email: emailA, password: PW }).expect(200);
    expect((await a.get('/api/projects/not-a-uuid')).status).toBe(404);
  });
});
