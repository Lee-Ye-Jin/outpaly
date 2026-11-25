// Phase 5: 배경 이미지 업로드 · 정리(회전 반영, 메타데이터 제거) · 소유권 · 삭제 보호

import { readFile } from 'node:fs/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { loadImage } from '@napi-rs/canvas';
import { createApp } from './app.ts';
import { prisma } from './lib/prisma.ts';
import { storage } from './lib/storage/index.ts';
import { makeImage, signedInAgent, uploadAsset, withExif } from '../test/helpers.ts';

const app = createApp();
afterAll(() => prisma.$disconnect());

type Agent = Awaited<ReturnType<typeof signedInAgent>>['agent'];

async function storedFile(assetId: string) {
  const a = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
  return storage.withLocalFile(a.storageKey, (p) => readFile(p));
}

async function setBackground(agent: Agent, projectId: string, assetId: string | null) {
  const p = (await agent.get(`/api/projects/${projectId}`)).body.project;
  return agent.patch(`/api/projects/${projectId}`).send({ settings: { ...p.settings, background: { ...p.settings.background, assetId } } });
}

describe('배경 이미지 업로드', () => {
  it('PNG·WebP 를 올리면 크기를 읽고 목록에 나온다', async () => {
    const { agent } = await signedInAgent(app);
    const png = await uploadAsset(agent, await makeImage('png', 640, 360), 'image/png');
    expect(png.status).toBe(201);
    expect(png.body.asset).toMatchObject({ type: 'IMAGE', mimeType: 'image/png', width: 640, height: 360 });
    const webp = await uploadAsset(agent, await makeImage('webp', 320, 320), 'image/webp', 'a.webp');
    expect(webp.body.asset).toMatchObject({ mimeType: 'image/webp', width: 320, height: 320 });
    const list = (await agent.get('/api/assets')).body.assets.map((a: { id: string }) => a.id);
    expect(list).toEqual([webp.body.asset.id, png.body.asset.id]);
  });

  it('휴대폰 사진의 회전 정보(EXIF)를 픽셀에 반영하고, EXIF 를 지운 파일로 저장한다', async () => {
    const { agent } = await signedInAgent(app);
    // 가로 200 × 세로 100 으로 찍혔지만 "90° 돌려서 보라"는 정보가 있는 사진
    const photo = withExif(await makeImage('jpeg', 200, 100), 6);
    expect(photo.includes(Buffer.from('SECRET-LOCATION'))).toBe(true);

    const res = await uploadAsset(agent, photo, 'image/jpeg', 'IMG_0001.jpg');
    expect(res.status).toBe(201);
    expect(res.body.asset).toMatchObject({ width: 100, height: 200 }); // 돌린 뒤의 크기

    const stored = await storedFile(res.body.asset.id);
    expect(stored.includes(Buffer.from('Exif\0\0', 'binary'))).toBe(false);
    expect(stored.includes(Buffer.from('SECRET-LOCATION'))).toBe(false);
    // 저장된 파일을 다시 열어도 (회전 정보 없이) 세로 사진이다 → 브라우저·서버 어디서 열어도 같은 방향
    const img = await loadImage(stored);
    expect([img.width, img.height]).toEqual([100, 200]);
  });

  it('이미지가 아닌 파일은 400, 저장된 파일도 지운다', async () => {
    const { agent } = await signedInAgent(app);
    const fake = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'.repeat(10));
    const target = await agent.post('/api/assets/upload-url').send({ filename: 'x.png', mimeType: 'image/png', sizeBytes: fake.length });
    await agent.put(target.body.url).set(target.body.headers).send(fake).expect(204);
    const res = await agent.post('/api/assets/complete').send({ key: target.body.key });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_IMAGE');
    expect(await storage.stat(target.body.key)).toBeNull();
  });

  it('형식·용량·크기 제한', async () => {
    const { agent } = await signedInAgent(app);
    expect((await agent.post('/api/assets/upload-url').send({ filename: 'a.gif', mimeType: 'image/gif', sizeBytes: 10 })).status).toBe(400);
    expect((await agent.post('/api/assets/upload-url').send({ filename: 'a.png', mimeType: 'image/png', sizeBytes: 21 * 1024 * 1024 })).status).toBe(400);
    const tiny = await uploadAsset(agent, await makeImage('png', 8, 8), 'image/png');
    expect(tiny.status).toBe(400);
  });
});

describe('소유권', () => {
  it('남의 이미지는 볼 수 없고, 내 프로젝트 배경으로 지정할 수도 없다', async () => {
    const a = await signedInAgent(app, 'a');
    const b = await signedInAgent(app, 'b');
    const aAsset = (await uploadAsset(a.agent, await makeImage('png', 64, 36), 'image/png')).body.asset;
    expect((await a.agent.get(aAsset.url)).status).toBe(200);
    expect((await b.agent.get(aAsset.url)).status).toBe(404);
    expect((await b.agent.delete(`/api/assets/${aAsset.id}`)).status).toBe(404);

    const bProject = (await b.agent.post('/api/projects').send({ title: 'B' })).body.project.id;
    const res = await setBackground(b.agent, bProject, aAsset.id);
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe('settings.background.assetId');
    // 없는 id 도 마찬가지
    expect((await setBackground(b.agent, bProject, '00000000-0000-4000-8000-000000000000')).status).toBe(400);
  });

  it('내 이미지는 배경으로 지정되고, 다시 불러와도 남아 있다', async () => {
    const { agent } = await signedInAgent(app);
    const asset = (await uploadAsset(agent, await makeImage('png', 64, 36), 'image/png')).body.asset;
    const projectId = (await agent.post('/api/projects').send({ title: '배경' })).body.project.id;
    expect((await setBackground(agent, projectId, asset.id)).status).toBe(200);
    expect((await agent.get(`/api/projects/${projectId}`)).body.project.settings.background.assetId).toBe(asset.id);
  });
});

describe('삭제 보호', () => {
  it('배경으로 쓰는 중이면 409, 배경을 바꾸면 삭제되고 파일도 지워진다', async () => {
    const { agent } = await signedInAgent(app);
    const asset = (await uploadAsset(agent, await makeImage('png', 64, 36), 'image/png')).body.asset;
    const projectId = (await agent.post('/api/projects').send({ title: '쓰는 중' })).body.project.id;
    await setBackground(agent, projectId, asset.id).then((r) => expect(r.status).toBe(200));
    const { storageKey } = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });

    const inUse = await agent.delete(`/api/assets/${asset.id}`);
    expect(inUse.status).toBe(409);
    expect(inUse.body.error.message).toContain('쓰는 중');

    await setBackground(agent, projectId, null).then((r) => expect(r.status).toBe(200));
    expect((await agent.delete(`/api/assets/${asset.id}`)).status).toBe(204);
    expect(await storage.stat(storageKey)).toBeNull();
  });
});
