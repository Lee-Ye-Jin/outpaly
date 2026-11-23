import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import type { Express } from 'express';
import { expect } from 'vitest';

let seq = 0;
const run = Date.now().toString(36);
const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

type Agent = ReturnType<typeof request.agent>;

/** 새 사용자를 가입시키고 그 세션을 가진 agent 를 돌려준다 */
export async function signedInAgent(app: Express, label = 'user') {
  const email = `${label}-${run}-${++seq}@test.outpaly`;
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({ email, password: 'correct horse battery' });
  expect(res.status).toBe(201);
  return { agent, email, userId: res.body.user.id as string };
}

/** 제목 "테스트 곡", 아티스트 "OutPaly Test" 태그가 있는 2.04초 MP3 */
export const MP3_2S = readFileSync(path.join(fixtures, 'tone-2s.mp3'));

/** 16bit 스테레오 44.1kHz 무음 WAV (태그 없음) */
export function makeWav(seconds: number): Buffer {
  const rate = 44100;
  const channels = 2;
  const dataBytes = Math.round(seconds * rate) * channels * 2;
  const b = Buffer.alloc(44 + dataBytes);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + dataBytes, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * channels * 2, 28);
  b.writeUInt16LE(channels * 2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(dataBytes, 40);
  return b;
}

/** 업로드 3단계: 주소 발급 → PUT → complete. complete 응답을 돌려준다 */
export async function uploadTrack(agent: Agent, body: Buffer, mimeType: string, filename: string) {
  const target = await agent.post('/api/tracks/upload-url').send({ filename, mimeType, sizeBytes: body.length });
  expect(target.status).toBe(201);
  const put = await agent.put(target.body.url).set(target.body.headers).send(body);
  expect(put.status).toBe(204);
  return agent.post('/api/tracks/complete').send({ key: target.body.key, filename });
}
