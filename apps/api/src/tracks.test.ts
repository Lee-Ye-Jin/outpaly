// Phase 4: 음악 업로드·검증·재생, 프로젝트 곡 추가·정렬·구간 편집·삭제, 재생 시간 계산
// 완료 기준: 여러 곡을 추가하고 순서를 바꾸면 바뀐 순서와 재생 시간이 정확하게 반영된다.

import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { prisma } from './lib/prisma.ts';
import { storage } from './lib/storage/index.ts';
import { MP3_2S, makeWav, signedInAgent, uploadTrack } from '../test/helpers.ts';

const app = createApp();
afterAll(() => prisma.$disconnect());

type Agent = Awaited<ReturnType<typeof signedInAgent>>['agent'];

async function newProject(agent: Agent) {
  const res = await agent.post('/api/projects').send({ title: '곡 테스트' });
  expect(res.status).toBe(201);
  return res.body.project.id as string;
}

describe('음악 업로드', () => {
  it('MP3 를 올리면 태그의 제목·아티스트와 실제 길이를 읽는다', async () => {
    const { agent } = await signedInAgent(app);
    const res = await uploadTrack(agent, MP3_2S, 'audio/mpeg', 'whatever.mp3');
    expect(res.status).toBe(201);
    expect(res.body.track).toMatchObject({ title: '테스트 곡', artist: 'OutPaly Test', mimeType: 'audio/mpeg', sizeBytes: MP3_2S.length });
    expect(res.body.track.duration).toBeCloseTo(2.04, 1);

    const list = await agent.get('/api/tracks');
    expect(list.body.tracks.map((t: { id: string }) => t.id)).toEqual([res.body.track.id]);
  });

  it('태그 없는 WAV 는 파일 이름으로 제목을 만든다', async () => {
    const { agent } = await signedInAgent(app);
    const res = await uploadTrack(agent, makeWav(3), 'audio/wav', '01_비 오는 오후.wav');
    expect(res.status).toBe(201);
    expect(res.body.track).toMatchObject({ title: '비 오는 오후', artist: null, mimeType: 'audio/wav' });
    expect(res.body.track.duration).toBeCloseTo(3, 2);
  });

  it('확장자만 .mp3 인 가짜 파일은 400, 저장된 파일도 지운다', async () => {
    const { agent } = await signedInAgent(app);
    const fake = Buffer.from('this is not audio at all '.repeat(100));
    const target = await agent.post('/api/tracks/upload-url').send({ filename: 'fake.mp3', mimeType: 'audio/mpeg', sizeBytes: fake.length });
    await agent.put(target.body.url).set(target.body.headers).send(fake).expect(204);
    const res = await agent.post('/api/tracks/complete').send({ key: target.body.key, filename: 'fake.mp3' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_AUDIO');
    expect(await storage.stat(target.body.key)).toBeNull();
  });

  it('지원하지 않는 형식·너무 큰 파일은 업로드 주소를 주지 않는다', async () => {
    const { agent } = await signedInAgent(app);
    expect((await agent.post('/api/tracks/upload-url').send({ filename: 'a.flac', mimeType: 'audio/flac', sizeBytes: 10 })).status).toBe(400);
    expect((await agent.post('/api/tracks/upload-url').send({ filename: 'a.mp3', mimeType: 'audio/mpeg', sizeBytes: 101 * 1024 * 1024 })).status).toBe(400);
  });

  it('위조한 업로드 토큰과 다른 Content-Type 은 거절한다', async () => {
    const { agent } = await signedInAgent(app);
    const target = await agent.post('/api/tracks/upload-url').send({ filename: 'a.mp3', mimeType: 'audio/mpeg', sizeBytes: MP3_2S.length });
    const [payload] = (target.body.url as string).split('/').at(-1)!.split('.');
    expect((await agent.put(`/api/storage/upload/${payload}.forged`).set(target.body.headers).send(MP3_2S)).status).toBe(403);
    expect((await agent.put(target.body.url).set('Content-Type', 'audio/wav').send(MP3_2S)).status).toBe(400);
  });

  it('다른 사용자의 파일 키로는 complete 할 수 없다', async () => {
    const a = await signedInAgent(app, 'a');
    const b = await signedInAgent(app, 'b');
    const target = await a.agent.post('/api/tracks/upload-url').send({ filename: 'a.mp3', mimeType: 'audio/mpeg', sizeBytes: MP3_2S.length });
    await a.agent.put(target.body.url).set(target.body.headers).send(MP3_2S).expect(204);
    const res = await b.agent.post('/api/tracks/complete').send({ key: target.body.key, filename: 'a.mp3' });
    expect(res.status).toBe(403);
  });

  it('같은 파일로 complete 를 두 번 해도 곡은 하나다', async () => {
    const { agent } = await signedInAgent(app);
    const target = await agent.post('/api/tracks/upload-url').send({ filename: 'a.mp3', mimeType: 'audio/mpeg', sizeBytes: MP3_2S.length });
    await agent.put(target.body.url).set(target.body.headers).send(MP3_2S).expect(204);
    const first = await agent.post('/api/tracks/complete').send({ key: target.body.key, filename: 'a.mp3' });
    const second = await agent.post('/api/tracks/complete').send({ key: target.body.key, filename: 'a.mp3' });
    expect(second.body.track.id).toBe(first.body.track.id);
    expect((await agent.get('/api/tracks')).body.tracks).toHaveLength(1);
  });
});

describe('재생 (stream)', () => {
  it('내 곡은 재생되고 Range 요청(구간 탐색)을 지원한다. 남의 곡은 404', async () => {
    const a = await signedInAgent(app, 'a');
    const b = await signedInAgent(app, 'b');
    const { body } = await uploadTrack(a.agent, MP3_2S, 'audio/mpeg', 'a.mp3');
    const url = `/api/tracks/${body.track.id}/stream`;

    const full = await a.agent.get(url).buffer(true);
    expect(full.status).toBe(200);
    expect(full.headers['content-type']).toBe('audio/mpeg');
    expect(Number(full.headers['content-length'])).toBe(MP3_2S.length);

    const part = await a.agent.get(url).set('Range', 'bytes=100-199').buffer(true);
    expect(part.status).toBe(206);
    expect(part.headers['content-range']).toBe(`bytes 100-199/${MP3_2S.length}`);

    expect((await b.agent.get(url)).status).toBe(404);
  });
});

describe('프로젝트 곡 편집 (완료 기준)', () => {
  it('곡 3개 추가 → 순서 변경 → 구간·무음 편집이 순서와 전체 길이에 정확히 반영된다', async () => {
    const { agent } = await signedInAgent(app);
    const projectId = await newProject(agent);
    const t2 = (await uploadTrack(agent, makeWav(2), 'audio/wav', 'two.wav')).body.track;
    const t3 = (await uploadTrack(agent, makeWav(3), 'audio/wav', 'three.wav')).body.track;
    const t5 = (await uploadTrack(agent, makeWav(5), 'audio/wav', 'five.wav')).body.track;

    const added = await agent.post(`/api/projects/${projectId}/tracks`).send({ trackIds: [t2.id, t3.id, t5.id] });
    expect(added.status).toBe(201);
    expect(added.body.tracks.map((t: { track: { title: string } }) => t.track.title)).toEqual(['two', 'three', 'five']);

    let detail = (await agent.get(`/api/projects/${projectId}`)).body.project;
    expect(detail.trackCount).toBe(3);
    expect(detail.totalDuration).toBeCloseTo(10, 2);

    // 순서 변경: five, two, three
    const [p2, p3, p5] = added.body.tracks.map((t: { id: string }) => t.id);
    const reordered = await agent.patch(`/api/projects/${projectId}/tracks/reorder`).send({ order: [p5, p2, p3] });
    expect(reordered.status).toBe(200);
    expect(reordered.body.tracks.map((t: { id: string; sortOrder: number }) => [t.id, t.sortOrder])).toEqual([
      [p5, 0],
      [p2, 1],
      [p3, 2]
    ]);

    // five 를 1~4초만 쓰고 뒤에 무음 1초, three 의 제목을 바꾼다 → 3 + 1 + 2 + 3 = 9초
    await agent.patch(`/api/projects/${projectId}/tracks/${p5}`).send({ trimStart: 1, trimEnd: 4, gapAfter: 1 }).expect(200);
    await agent.patch(`/api/projects/${projectId}/tracks/${p3}`).send({ displayTitle: '세 번째 곡' }).expect(200);

    detail = (await agent.get(`/api/projects/${projectId}`)).body.project;
    expect(detail.tracks.map((t: { id: string }) => t.id)).toEqual([p5, p2, p3]);
    expect(detail.tracks[0]).toMatchObject({ trimStart: 1, trimEnd: 4, gapAfter: 1 });
    expect(detail.tracks[2].displayTitle).toBe('세 번째 곡');
    expect(detail.totalDuration).toBeCloseTo(9, 2);

    // 대시보드 목록에도 같은 길이
    const list = (await agent.get('/api/projects')).body.projects;
    expect(list.find((p: { id: string }) => p.id === projectId).totalDuration).toBeCloseTo(9, 2);

    // 하나 빼면 남은 곡 번호를 0,1 로 다시 매긴다
    const removed = await agent.delete(`/api/projects/${projectId}/tracks/${p2}`);
    expect(removed.body.tracks.map((t: { id: string; sortOrder: number }) => [t.id, t.sortOrder])).toEqual([
      [p5, 0],
      [p3, 1]
    ]);
  });

  it('곡을 추가·정렬해도 디자인 저장(revision)과 충돌하지 않는다', async () => {
    const { agent } = await signedInAgent(app);
    const projectId = await newProject(agent);
    const t = (await uploadTrack(agent, makeWav(2), 'audio/wav', 'a.wav')).body.track;
    await agent.post(`/api/projects/${projectId}/tracks`).send({ trackIds: [t.id, t.id] }).expect(201);
    const res = await agent.patch(`/api/projects/${projectId}`).send({ title: '디자인 저장', expectedRevision: 0 });
    expect(res.status).toBe(200);
  });

  it('잘못된 구간은 400: 곡보다 긴 끝 지점, 1초보다 짧은 구간', async () => {
    const { agent } = await signedInAgent(app);
    const projectId = await newProject(agent);
    const t = (await uploadTrack(agent, makeWav(3), 'audio/wav', 'a.wav')).body.track;
    const [pt] = (await agent.post(`/api/projects/${projectId}/tracks`).send({ trackIds: [t.id] })).body.tracks;
    const url = `/api/projects/${projectId}/tracks/${pt.id}`;
    expect((await agent.patch(url).send({ trimEnd: 10 })).body.error.field).toBe('trimEnd');
    expect((await agent.patch(url).send({ trimStart: 2.5 })).status).toBe(400);
    expect((await agent.patch(url).send({ gain: 20 })).status).toBe(400);
    // 끝 지점을 곡 길이와 같게 주면 "끝까지(null)"로 저장
    const ok = await agent.patch(url).send({ trimEnd: 3 });
    expect(ok.body.tracks[0].trimEnd).toBeNull();
  });

  it('순서 변경 목록이 현재 곡과 다르면 409 (다른 탭에서 곡을 바꾼 경우)', async () => {
    const { agent } = await signedInAgent(app);
    const projectId = await newProject(agent);
    const t = (await uploadTrack(agent, makeWav(2), 'audio/wav', 'a.wav')).body.track;
    const tracks = (await agent.post(`/api/projects/${projectId}/tracks`).send({ trackIds: [t.id, t.id] })).body.tracks;
    const res = await agent.patch(`/api/projects/${projectId}/tracks/reorder`).send({ order: [tracks[0].id] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TRACKS_CHANGED');
  });

  it('한 프로젝트에 50곡까지', async () => {
    const { agent } = await signedInAgent(app);
    const projectId = await newProject(agent);
    const t = (await uploadTrack(agent, makeWav(1.5), 'audio/wav', 'a.wav')).body.track;
    await agent.post(`/api/projects/${projectId}/tracks`).send({ trackIds: Array(50).fill(t.id) }).expect(201);
    const res = await agent.post(`/api/projects/${projectId}/tracks`).send({ trackIds: [t.id] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TOO_MANY_TRACKS');
  });
});

describe('다른 사용자 차단', () => {
  it('B 는 A 의 곡을 자기 프로젝트에 넣을 수 없고, A 의 프로젝트 곡을 건드릴 수 없다', async () => {
    const a = await signedInAgent(app, 'a');
    const b = await signedInAgent(app, 'b');
    const aProject = await newProject(a.agent);
    const bProject = await newProject(b.agent);
    const aTrack = (await uploadTrack(a.agent, makeWav(2), 'audio/wav', 'a.wav')).body.track;
    const [aPt] = (await a.agent.post(`/api/projects/${aProject}/tracks`).send({ trackIds: [aTrack.id] })).body.tracks;

    expect((await b.agent.post(`/api/projects/${bProject}/tracks`).send({ trackIds: [aTrack.id] })).status).toBe(404);
    expect((await b.agent.post(`/api/projects/${aProject}/tracks`).send({ trackIds: [aTrack.id] })).status).toBe(404);
    expect((await b.agent.patch(`/api/projects/${aProject}/tracks/${aPt.id}`).send({ gain: -3 })).status).toBe(404);
    expect((await b.agent.patch(`/api/projects/${aProject}/tracks/reorder`).send({ order: [aPt.id] })).status).toBe(404);
    expect((await b.agent.delete(`/api/projects/${aProject}/tracks/${aPt.id}`)).status).toBe(404);
    expect((await b.agent.delete(`/api/tracks/${aTrack.id}`)).status).toBe(404);

    const still = (await a.agent.get(`/api/projects/${aProject}`)).body.project.tracks;
    expect(still).toHaveLength(1);
    expect(still[0].gain).toBe(0);
  });
});

describe('음악 삭제', () => {
  it('프로젝트에서 쓰는 중이면 409, 빼고 나면 삭제되고 파일도 지워진다', async () => {
    const { agent } = await signedInAgent(app);
    const projectId = await newProject(agent);
    const t = (await uploadTrack(agent, makeWav(2), 'audio/wav', 'a.wav')).body.track;
    const [pt] = (await agent.post(`/api/projects/${projectId}/tracks`).send({ trackIds: [t.id] })).body.tracks;
    const { storageKey } = await prisma.track.findUniqueOrThrow({ where: { id: t.id } });

    const inUse = await agent.delete(`/api/tracks/${t.id}`);
    expect(inUse.status).toBe(409);
    expect(inUse.body.error.message).toContain('곡 테스트');

    await agent.delete(`/api/projects/${projectId}/tracks/${pt.id}`).expect(200);
    expect((await agent.delete(`/api/tracks/${t.id}`)).status).toBe(204);
    expect(await storage.stat(storageKey)).toBeNull();
  });
});
