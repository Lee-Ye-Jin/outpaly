import request from 'supertest';
import type { Express } from 'express';
import { expect } from 'vitest';

let seq = 0;
const run = Date.now().toString(36);

/** 새 사용자를 가입시키고 그 세션을 가진 agent 를 돌려준다 */
export async function signedInAgent(app: Express, label = 'user') {
  const email = `${label}-${run}-${++seq}@test.outpaly`;
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({ email, password: 'correct horse battery' });
  expect(res.status).toBe(201);
  return { agent, email, userId: res.body.user.id as string };
}
