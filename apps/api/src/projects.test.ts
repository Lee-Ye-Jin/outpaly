// Phase 3: 프로젝트 생성·수정·삭제·복제, 설정 저장, 동시 수정 충돌, 다른 사용자 차단

import { afterAll, describe, expect, it } from 'vitest';
import { createDefaultSettings } from '@outpaly/shared';
import { createApp } from './app.ts';
import { prisma } from './lib/prisma.ts';
import { signedInAgent } from '../test/helpers.ts';

const app = createApp();
afterAll(() => prisma.$disconnect());

async function newProject(agent: Awaited<ReturnType<typeof signedInAgent>>['agent'], title = '테스트 플레이리스트') {
  const res = await agent.post('/api/projects').send({ title });
  expect(res.status).toBe(201);
  return res.body.project as { id: string; title: string; revision: number; updatedAt: string; settings: ReturnType<typeof createDefaultSettings> };
}

describe('프로젝트 수정 (PATCH)', () => {
  it('제목과 설정을 저장하고, 다시 불러오면 그대로 나온다', async () => {
    const { agent } = await signedInAgent(app);
    const p = await newProject(agent);

    const settings = structuredClone(p.settings);
    settings.titleLayer.text = '비 오는 날 재즈';
    settings.titleLayer.subtitle = '창가에서 듣는 플레이리스트';
    settings.background.dim = 0.5;
    settings.tracklistLayer.position = 'bottom';
    settings.output = { width: 1280, height: 720, fps: 30 };

    const res = await agent.patch(`/api/projects/${p.id}`).send({ title: '재즈 모음', settings });
    expect(res.status).toBe(200);
    expect(res.body.project.title).toBe('재즈 모음');
    expect(new Date(res.body.project.updatedAt).getTime()).toBeGreaterThan(new Date(p.updatedAt).getTime() - 1);

    const reloaded = await agent.get(`/api/projects/${p.id}`);
    expect(reloaded.body.project.title).toBe('재즈 모음');
    expect(reloaded.body.project.settings).toEqual(settings);
  });

  it('제목만 바꿔도 설정은 유지된다', async () => {
    const { agent } = await signedInAgent(app);
    const p = await newProject(agent);
    const res = await agent.patch(`/api/projects/${p.id}`).send({ title: '이름만 변경' });
    expect(res.status).toBe(200);
    expect(res.body.project.settings).toEqual(p.settings);
  });

  it('범위를 벗어난 설정값과 빈 요청은 400', async () => {
    const { agent } = await signedInAgent(app);
    const p = await newProject(agent);
    const bad = structuredClone(p.settings) as unknown as { background: { dim: number } };
    bad.background.dim = 5;
    expect((await agent.patch(`/api/projects/${p.id}`).send({ settings: bad })).status).toBe(400);
    expect((await agent.patch(`/api/projects/${p.id}`).send({})).status).toBe(400);
    expect((await agent.patch(`/api/projects/${p.id}`).send({ title: '   ' })).status).toBe(400);
  });

  it('expectedRevision 이 서버 값과 다르면 409 와 최신 상태를 준다 (다른 탭에서 먼저 저장)', async () => {
    const { agent } = await signedInAgent(app);
    const p = await newProject(agent);
    expect(p.revision).toBe(0);

    // 탭 1 이 저장 → revision 1
    const first = await agent.patch(`/api/projects/${p.id}`).send({ title: '탭 1', expectedRevision: 0 });
    expect(first.status).toBe(200);
    expect(first.body.project.revision).toBe(1);

    // 탭 2 는 예전 revision 을 들고 저장 시도 → 거절, 탭 1 의 내용이 남아 있어야 한다
    const second = await agent.patch(`/api/projects/${p.id}`).send({ title: '탭 2', expectedRevision: 0 });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CONFLICT');
    expect(second.body.project.title).toBe('탭 1');

    // 최신 revision 으로 다시 보내면 성공
    const retry = await agent
      .patch(`/api/projects/${p.id}`)
      .send({ title: '탭 2', expectedRevision: second.body.project.revision });
    expect(retry.status).toBe(200);
    expect(retry.body.project.title).toBe('탭 2');
  });
});

describe('프로젝트 삭제 · 복제', () => {
  it('삭제하면 204, 이후 조회는 404, 목록에서도 사라진다', async () => {
    const { agent } = await signedInAgent(app);
    const p = await newProject(agent);
    expect((await agent.delete(`/api/projects/${p.id}`)).status).toBe(204);
    expect((await agent.get(`/api/projects/${p.id}`)).status).toBe(404);
    expect((await agent.delete(`/api/projects/${p.id}`)).status).toBe(404);
    const list = await agent.get('/api/projects');
    expect(list.body.projects.map((x: { id: string }) => x.id)).not.toContain(p.id);
  });

  it('복제하면 새 id, "(사본)" 제목, 같은 설정, 같은 곡 순서를 가진다', async () => {
    const { agent, userId } = await signedInAgent(app);
    const p = await newProject(agent, '원본');
    const settings = structuredClone(p.settings);
    settings.background.color = '#223344';
    await agent.patch(`/api/projects/${p.id}`).send({ settings }).expect(200);

    // 곡 업로드 API 는 Phase 4. 여기서는 DB 에 직접 곡 2개를 넣는다
    const tracks = await Promise.all(
      [180, 240].map((duration, i) =>
        prisma.track.create({
          data: { userId, title: `곡 ${i + 1}`, storageKey: `k${i}`, mimeType: 'audio/mpeg', sizeBytes: 1n, duration }
        })
      )
    );
    await prisma.projectTrack.createMany({
      data: tracks.map((t, i) => ({ projectId: p.id, trackId: t.id, sortOrder: i, gain: i === 1 ? -3 : 0 }))
    });

    const res = await agent.post(`/api/projects/${p.id}/duplicate`);
    expect(res.status).toBe(201);
    const copy = res.body.project;
    expect(copy.id).not.toBe(p.id);
    expect(copy.title).toBe('원본 (사본)');
    expect(copy.settings.background.color).toBe('#223344');
    expect(copy.trackCount).toBe(2);

    const copied = await prisma.projectTrack.findMany({ where: { projectId: copy.id }, orderBy: { sortOrder: 'asc' } });
    expect(copied.map((t) => [t.trackId, t.sortOrder, t.gain])).toEqual([
      [tracks[0]!.id, 0, 0],
      [tracks[1]!.id, 1, -3]
    ]);

    // 원본을 지워도 사본과 원본 음원은 남는다
    await agent.delete(`/api/projects/${p.id}`).expect(204);
    expect((await agent.get(`/api/projects/${copy.id}`)).body.project.trackCount).toBe(2);
    expect(await prisma.track.count({ where: { userId } })).toBe(2);
  });
});

describe('다른 사용자의 프로젝트는 수정·삭제·복제할 수 없다', () => {
  it('B 의 PATCH / DELETE / duplicate 는 모두 404 이고 A 의 프로젝트는 그대로다', async () => {
    const a = await signedInAgent(app, 'owner');
    const b = await signedInAgent(app, 'intruder');
    const p = await newProject(a.agent, 'A 의 것');

    expect((await b.agent.patch(`/api/projects/${p.id}`).send({ title: '탈취' })).status).toBe(404);
    expect((await b.agent.delete(`/api/projects/${p.id}`)).status).toBe(404);
    expect((await b.agent.post(`/api/projects/${p.id}/duplicate`)).status).toBe(404);

    const still = await a.agent.get(`/api/projects/${p.id}`);
    expect(still.status).toBe(200);
    expect(still.body.project.title).toBe('A 의 것');
    expect((await b.agent.get('/api/projects')).body.projects).toEqual([]);
  });
});

describe('손상된 settings', () => {
  it('DB 의 settings 형식이 깨져 있어도 500 이 아니라 기본값으로 연다', async () => {
    const { agent } = await signedInAgent(app);
    const p = await newProject(agent, '깨진 설정');
    await prisma.project.update({ where: { id: p.id }, data: { settings: { version: 0, nonsense: true } } });
    const res = await agent.get(`/api/projects/${p.id}`);
    expect(res.status).toBe(200);
    expect(res.body.project.settings).toEqual(createDefaultSettings('깨진 설정'));
  });
});
