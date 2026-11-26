// Phase 6 완료 기준: 편집한 프로젝트를 실제 MP4 로 만들고, 음악과 영상이 정상적으로 나와야 한다.
// API 로 렌더를 요청 → Worker 가 실제 ffmpeg 로 처리 → API 로 상태·다운로드 확인.

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ffmpegStatic from 'ffmpeg-static';
import { PrismaClient } from '@prisma/client';
import { LocalFileStore } from '@outpaly/storage';
import { createApp } from '../../api/src/app.ts';
import { env } from '../../api/src/config/env.ts';
import { makeImage, makeWav, signedInAgent, uploadAsset, uploadTrack } from '../../api/test/helpers.ts';
import { spawn } from 'node:child_process';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { registerFonts } from './render/fonts.ts';
import { probeDuration, RenderCancelledError } from './render/ffmpeg.ts';
import { renderSnapshot } from './render/pipeline.ts';
import { RenderWorker } from './worker.ts';
import { createDefaultSettings, FONT_IDS, type FontId, type RenderSnapshot } from '@outpaly/shared';
import { drawFrame, serverFonts, type FrameContext } from '@outpaly/render-core';

const ffmpegPath = ffmpegStatic as unknown as string;
const app = createApp();
const prisma = new PrismaClient();
const store = new LocalFileStore(env.STORAGE_DIR);
const workDir = path.join(os.tmpdir(), `outpaly-render-test-${process.pid}`);
const deps = { prisma, store, ffmpegPath, workDir, heartbeatMs: 200, staleMs: 60_000, maxAttempts: 3, log: () => undefined };
const worker = new RenderWorker({ ...deps, workerId: 'test-worker' });

type Agent = Awaited<ReturnType<typeof signedInAgent>>['agent'];

beforeAll(async () => {
  registerFonts();
  // 이전 테스트가 남긴 대기 작업이 있으면 이 파일의 결과가 섞이므로 정리
  await prisma.renderJob.deleteMany({});
});
afterAll(async () => {
  await prisma.$disconnect();
  await fs.rm(workDir, { recursive: true, force: true });
});

/** 2초·3초 WAV 두 곡. 첫 곡 뒤 무음 1초 → 6초 영상 */
async function projectWithTracks(agent: Agent) {
  const projectId = (await agent.post('/api/projects').send({ title: '렌더 테스트' })).body.project.id as string;
  const a = (await uploadTrack(agent, makeWav(2), 'audio/wav', '첫 곡.wav')).body.track;
  const b = (await uploadTrack(agent, makeWav(3), 'audio/wav', '둘째 곡.wav')).body.track;
  const pts = (await agent.post(`/api/projects/${projectId}/tracks`).send({ trackIds: [a.id, b.id] })).body.tracks;
  await agent.patch(`/api/projects/${projectId}/tracks/${pts[0].id}`).send({ gapAfter: 1 }).expect(200);
  return { projectId, trackIds: [a.id, b.id] as string[] };
}

describe('렌더링 (완료 기준)', () => {
  it('요청 → Worker 처리 → 완료: 길이·해상도·타임스탬프가 정확하고 MP4 를 받을 수 있다', async () => {
    const { agent } = await signedInAgent(app);
    const { projectId } = await projectWithTracks(agent);

    const created = await agent.post('/api/renders').send({ projectId });
    expect(created.status).toBe(201);
    expect(created.body.render).toMatchObject({ status: 'QUEUED', progress: 0, trackCount: 2, width: 1920, height: 1080 });
    expect(created.body.render.expectedDuration).toBeCloseTo(6, 3);

    expect(await worker.runOnce()).toBe(true);

    const done = (await agent.get(`/api/renders/${created.body.render.id}`)).body.render;
    expect(done.status).toBe('COMPLETED');
    expect(done.progress).toBe(100);
    expect(done.output.duration).toBeCloseTo(6, 1);
    expect(done.output.timestamps).toBe('0:00 첫 곡\n0:03 둘째 곡');

    const dl = await agent.get(done.output.downloadUrl).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(dl.status).toBe(200);
    expect(dl.headers['content-type']).toBe('video/mp4');
    expect(dl.headers['content-disposition']).toContain(encodeURIComponent('렌더 테스트.mp4'));
    // 받은 파일이 실제로 재생 가능한 6초 MP4 인지 ffmpeg 로 확인
    const file = path.join(os.tmpdir(), `outpaly-dl-${process.pid}.mp4`);
    await fs.writeFile(file, dl.body as Buffer);
    expect(await probeDuration(ffmpegPath, file)).toBeCloseTo(6, 1);
    await fs.rm(file, { force: true });

    // 프로젝트별 기록에도 보인다
    const list = (await agent.get(`/api/projects/${projectId}/renders`)).body.renders;
    expect(list[0].id).toBe(done.id);
  });

  it('렌더 요청 뒤 프로젝트를 고쳐도 결과물은 요청 시점 그대로다 (스냅샷)', async () => {
    const { agent } = await signedInAgent(app);
    const { projectId } = await projectWithTracks(agent);
    const { body } = await agent.post('/api/renders').send({ projectId }).expect(201);
    const pts = (await agent.get(`/api/projects/${projectId}`)).body.project.tracks;
    await agent.delete(`/api/projects/${projectId}/tracks/${pts[1].id}`).expect(200); // 요청 뒤 곡 하나 빼기
    await worker.runOnce();
    const done = (await agent.get(`/api/renders/${body.render.id}`)).body.render;
    expect(done.status).toBe('COMPLETED');
    expect(done.output.duration).toBeCloseTo(6, 1);
  });
});

describe('해상도 (720p)', () => {
  /** MP4 의 영상 해상도 */
  function probeSize(file: string): Promise<[number, number]> {
    return new Promise((resolve, reject) => {
      const p = spawn(ffmpegPath, ['-hide_banner', '-i', file]);
      let err = '';
      p.stderr.on('data', (d: Buffer) => (err += d.toString()));
      p.on('close', () => {
        const m = err.match(/Video:.*?, (\d{3,5})x(\d{3,5})/);
        if (m) resolve([Number(m[1]), Number(m[2])]);
        else reject(new Error('해상도를 읽지 못함'));
      });
    });
  }

  /** 1초 지점 화면을 640x360 RGB 로 (두 해상도를 같은 크기에서 비교) */
  function frameRgb(file: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const p = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-ss', '1', '-i', file, '-frames:v', '1', '-vf', 'scale=640:360', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
      const chunks: Buffer[] = [];
      p.stdout.on('data', (d: Buffer) => chunks.push(d));
      p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`ffmpeg ${code}`))));
    });
  }

  const meanDiff = (a: Buffer, b: Buffer) => {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
    return sum / a.length;
  };

  async function renderWith(agent: Agent, projectId: string, patch: (s: Record<string, any>) => Record<string, any>) {
    const p = (await agent.get(`/api/projects/${projectId}`)).body.project;
    await agent.patch(`/api/projects/${projectId}`).send({ settings: patch(structuredClone(p.settings)) }).expect(200);
    const { body } = await agent.post('/api/renders').send({ projectId }).expect(201);
    await worker.runOnce();
    const done = (await agent.get(`/api/renders/${body.render.id}`)).body.render;
    expect(done.status).toBe('COMPLETED');
    const out = await prisma.renderOutput.findFirstOrThrow({ where: { renderJobId: body.render.id } });
    return { render: done, file: await store.withLocalFile(out.storageKey, async (f) => f) };
  }

  it('720p 를 고르면 1280x720 MP4 가 나오고, 구도는 1080p 와 같다 (줄인 크기일 뿐)', async () => {
    const { agent } = await signedInAgent(app);
    const { projectId } = await projectWithTracks(agent);
    const look = (s: Record<string, any>) => ({
      ...s,
      background: { ...s.background, color: '#3A6EA5', dim: 0 },
      titleLayer: { ...s.titleLayer, text: '해상도 비교', subtitle: '부제도 함께' }
    });

    const full = await renderWith(agent, projectId, (s) => ({ ...look(s), output: { width: 1920, height: 1080, fps: 30 } }));
    const small = await renderWith(agent, projectId, (s) => ({ ...look(s), output: { width: 1280, height: 720, fps: 30 } }));
    // 대조군: 같은 720p 인데 제목을 옮긴 것 — 비교 방법이 배치 차이를 잡아내는지 확인
    const moved = await renderWith(agent, projectId, (s) => {
      const l = look(s);
      return { ...l, output: { width: 1280, height: 720, fps: 30 }, titleLayer: { ...l.titleLayer, position: { x: 0.4, y: 0.6 } } };
    });

    expect(await probeSize(full.file)).toEqual([1920, 1080]);
    expect(await probeSize(small.file)).toEqual([1280, 720]);
    expect([small.render.output.width, small.render.output.height]).toEqual([1280, 720]);
    expect(small.render.output.sizeBytes).toBeLessThan(full.render.output.sizeBytes);

    const [a, b, c] = await Promise.all([frameRgb(full.file), frameRgb(small.file), frameRgb(moved.file)]);
    const same = meanDiff(a, b);
    const different = meanDiff(b, c);
    expect(same).toBeLessThan(3); // 압축·축소 오차 정도
    expect(different).toBeGreaterThan(same * 2); // 배치가 다르면 확실히 커진다
  });
});

describe('글꼴', () => {
  it('서버에 등록된 글꼴이 실제로 쓰인다: 글꼴을 바꾸면 그려진 화면이 달라진다', () => {
    const draw = (font: FontId) => {
      const s = createDefaultSettings('글꼴');
      s.titleLayer.font = font;
      s.titleLayer.text = '노을 질 무렵 ABC';
      const c = createCanvas(960, 540);
      const g = c.getContext('2d') as unknown as FrameContext<never>;
      g.scale(0.5, 0.5);
      drawFrame(g, { ...s, title: 'x', tracks: [] }, -1, null, serverFonts);
      return c.toBuffer('image/png');
    };
    const noto = draw('noto-sans-kr');
    for (const f of FONT_IDS.filter((f) => f !== 'noto-sans-kr')) {
      expect(draw(f).equals(noto), f).toBe(false);
    }
  });
});

describe('배경 이미지 (Phase 5)', () => {
  it('배경으로 고른 이미지가 MP4 화면에 그려진다', async () => {
    const { agent } = await signedInAgent(app);
    const { projectId } = await projectWithTracks(agent);
    const asset = (await uploadAsset(agent, await makeImage('png', 64, 36, '#ff0000'), 'image/png')).body.asset;
    const p = (await agent.get(`/api/projects/${projectId}`)).body.project;
    const settings = {
      ...p.settings,
      background: { ...p.settings.background, assetId: asset.id, dim: 0 },
      titleLayer: { ...p.settings.titleLayer, visible: false },
      tracklistLayer: { ...p.settings.tracklistLayer, visible: false }
    };
    await agent.patch(`/api/projects/${projectId}`).send({ settings }).expect(200);

    const { body } = await agent.post('/api/renders').send({ projectId }).expect(201);
    await worker.runOnce();
    const done = (await agent.get(`/api/renders/${body.render.id}`)).body.render;
    expect(done.status).toBe('COMPLETED');

    // 1초 지점 화면을 뽑아 가운데 픽셀이 빨간색인지 확인 (H.264 압축 오차를 감안)
    const out = await prisma.renderOutput.findFirstOrThrow({ where: { renderJobId: body.render.id } });
    const png = path.join(os.tmpdir(), `outpaly-bg-${process.pid}.png`);
    await store.withLocalFile(out.storageKey, (mp4) =>
      new Promise<void>((resolve, reject) => {
        const p2 = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '1', '-i', mp4, '-frames:v', '1', png]);
        p2.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
      })
    );
    const img = await loadImage(png);
    const c = createCanvas(img.width, img.height);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const [r, gr, b] = g.getImageData(960, 540, 1, 1).data;
    expect(r).toBeGreaterThan(200);
    expect(gr).toBeLessThan(50);
    expect(b).toBeLessThan(50);
    await fs.rm(png, { force: true });
  });

  it('배경 이미지 파일이 사라졌으면 FAILED 와 이유를 남긴다', async () => {
    const { agent } = await signedInAgent(app);
    const { projectId } = await projectWithTracks(agent);
    const asset = (await uploadAsset(agent, await makeImage('png', 64, 36), 'image/png')).body.asset;
    const p = (await agent.get(`/api/projects/${projectId}`)).body.project;
    await agent
      .patch(`/api/projects/${projectId}`)
      .send({ settings: { ...p.settings, background: { ...p.settings.background, assetId: asset.id } } })
      .expect(200);
    const { body } = await agent.post('/api/renders').send({ projectId }).expect(201);
    const a = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
    await store.delete(a.storageKey);
    await worker.runOnce();
    const r = (await agent.get(`/api/renders/${body.render.id}`)).body.render;
    expect(r.status).toBe('FAILED');
    expect(r.error).toContain('배경 이미지');
  });
});

describe('정리', () => {
  it('프로젝트를 지우면 렌더 결과 MP4 파일도 지운다', async () => {
    const { agent } = await signedInAgent(app);
    const { projectId } = await projectWithTracks(agent);
    const { body } = await agent.post('/api/renders').send({ projectId }).expect(201);
    await worker.runOnce();
    const out = await prisma.renderOutput.findFirstOrThrow({ where: { renderJobId: body.render.id } });
    expect(await store.stat(out.storageKey)).not.toBeNull();
    await agent.delete(`/api/projects/${projectId}`).expect(204);
    expect(await store.stat(out.storageKey)).toBeNull();
  });
});

describe('렌더 요청 규칙', () => {
  it('같은 프로젝트에 진행 중인 렌더가 있으면 409 와 그 작업을 준다', async () => {
    const { agent } = await signedInAgent(app);
    const { projectId } = await projectWithTracks(agent);
    const first = await agent.post('/api/renders').send({ projectId }).expect(201);
    const dup = await agent.post('/api/renders').send({ projectId });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('RENDER_IN_PROGRESS');
    expect(dup.body.render.id).toBe(first.body.render.id);
    await agent.post(`/api/renders/${first.body.render.id}/cancel`).expect(200);
  });

  it('곡이 없으면 400, 완성 전 다운로드는 409', async () => {
    const { agent } = await signedInAgent(app);
    const empty = (await agent.post('/api/projects').send({ title: '빈 프로젝트' })).body.project.id;
    expect((await agent.post('/api/renders').send({ projectId: empty })).body.error.code).toBe('NO_TRACKS');

    const { projectId } = await projectWithTracks(agent);
    const { body } = await agent.post('/api/renders').send({ projectId }).expect(201);
    expect((await agent.get(`/api/renders/${body.render.id}/download`)).status).toBe(409);
    await agent.post(`/api/renders/${body.render.id}/cancel`).expect(200);
  });

  it('렌더 대기 중에는 그 곡을 내 음악에서 지울 수 없다', async () => {
    const { agent } = await signedInAgent(app);
    const { projectId, trackIds } = await projectWithTracks(agent);
    const { body } = await agent.post('/api/renders').send({ projectId }).expect(201);
    await agent.delete(`/api/projects/${projectId}`).expect(204); // 프로젝트를 지워도 (렌더 작업도 CASCADE 로 지워짐)
    // 프로젝트와 함께 렌더 작업이 지워졌으므로 이제는 지울 수 있다
    expect((await agent.delete(`/api/tracks/${trackIds[0]}`)).status).toBe(204);

    const p2 = await projectWithTracks(agent);
    const r2 = await agent.post('/api/renders').send({ projectId: p2.projectId }).expect(201);
    const pts = (await agent.get(`/api/projects/${p2.projectId}`)).body.project.tracks;
    await agent.delete(`/api/projects/${p2.projectId}/tracks/${pts[0].id}`).expect(200); // 프로젝트에서는 뺐지만
    const res = await agent.delete(`/api/tracks/${p2.trackIds[0]}`); // 렌더가 쓰는 중
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TRACK_IN_RENDER');
    await agent.post(`/api/renders/${r2.body.render.id}/cancel`).expect(200);
    expect(body.render.id).toBeDefined();
  });

  it('다른 사용자는 남의 렌더를 보거나 취소·다운로드·요청할 수 없다', async () => {
    const a = await signedInAgent(app, 'a');
    const b = await signedInAgent(app, 'b');
    const { projectId } = await projectWithTracks(a.agent);
    const { body } = await a.agent.post('/api/renders').send({ projectId }).expect(201);
    const id = body.render.id;
    expect((await b.agent.get(`/api/renders/${id}`)).status).toBe(404);
    expect((await b.agent.post(`/api/renders/${id}/cancel`)).status).toBe(404);
    expect((await b.agent.get(`/api/renders/${id}/download`)).status).toBe(404);
    expect((await b.agent.post('/api/renders').send({ projectId })).status).toBe(404);
    expect((await b.agent.get(`/api/projects/${projectId}/renders`)).status).toBe(404);
    await a.agent.post(`/api/renders/${id}/cancel`).expect(200);
  });
});

describe('취소 · 실패 · 장애 복구', () => {
  it('대기 중에 취소하면 바로 CANCELLED, Worker 는 가져가지 않는다', async () => {
    const { agent } = await signedInAgent(app);
    const { projectId } = await projectWithTracks(agent);
    const { body } = await agent.post('/api/renders').send({ projectId }).expect(201);
    const res = await agent.post(`/api/renders/${body.render.id}/cancel`);
    expect(res.body.render.status).toBe('CANCELLED');
    expect(await worker.runOnce()).toBe(false);
    expect((await agent.post(`/api/renders/${body.render.id}/cancel`)).status).toBe(409);
  });

  it('처리 중 취소 요청은 heartbeat 로 Worker 에게 전달되고, 파이프라인은 즉시 멈춘다', async () => {
    const { agent } = await signedInAgent(app);
    const { projectId } = await projectWithTracks(agent);
    const { body } = await agent.post('/api/renders').send({ projectId }).expect(201);
    const job = await worker.queue.claimNext();
    expect(job?.id).toBe(body.render.id);
    expect(await worker.queue.heartbeat(job!.id)).toBe('ok');
    await agent.post(`/api/renders/${job!.id}/cancel`).expect(200);
    expect(await worker.queue.heartbeat(job!.id)).toBe('cancel');

    const aborted = new AbortController();
    aborted.abort();
    const dir = path.join(workDir, 'cancel-test');
    await fs.mkdir(dir, { recursive: true });
    await expect(
      renderSnapshot(job!.snapshot as unknown as RenderSnapshot, { store, ffmpegPath, workDir: dir, signal: aborted.signal })
    ).rejects.toBeInstanceOf(RenderCancelledError);
    await worker.queue.cancelled(job!.id);
    expect((await agent.get(`/api/renders/${job!.id}`)).body.render.status).toBe('CANCELLED');
  });

  it('원본 파일이 없어지면 FAILED 와 이해할 수 있는 이유를 남긴다', async () => {
    const { agent } = await signedInAgent(app);
    const { projectId, trackIds } = await projectWithTracks(agent);
    const { body } = await agent.post('/api/renders').send({ projectId }).expect(201);
    const t = await prisma.track.findUniqueOrThrow({ where: { id: trackIds[1]! } });
    await store.delete(t.storageKey);
    await worker.runOnce();
    const r = (await agent.get(`/api/renders/${body.render.id}`)).body.render;
    expect(r.status).toBe('FAILED');
    expect(r.error).toContain('둘째 곡');
  });

  it('Worker 가 죽어 heartbeat 가 끊기면 다시 대기열로, 시도 횟수를 다 쓰면 FAILED', async () => {
    const { agent } = await signedInAgent(app);
    const { projectId } = await projectWithTracks(agent);
    const { body } = await agent.post('/api/renders').send({ projectId }).expect(201);
    const id = body.render.id;
    const old = new Date(Date.now() - 120_000);

    // 1번째 시도 중 죽음 → QUEUED
    await prisma.renderJob.update({ where: { id }, data: { status: 'PROCESSING', attempts: 1, heartbeatAt: old, workerId: 'dead' } });
    expect(await worker.queue.recoverStale(60_000, 3)).toBe(1);
    expect((await prisma.renderJob.findUniqueOrThrow({ where: { id } })).status).toBe('QUEUED');

    // 3번째 시도까지 죽음 → FAILED
    await prisma.renderJob.update({ where: { id }, data: { status: 'PROCESSING', attempts: 3, heartbeatAt: old, workerId: 'dead' } });
    await worker.queue.recoverStale(60_000, 3);
    const failed = await prisma.renderJob.findUniqueOrThrow({ where: { id } });
    expect(failed.status).toBe('FAILED');
    expect(failed.error).toContain('여러 번 시도');

    // 죽은 Worker 가 살아나도 작업은 더 이상 그의 것이 아니다
    const zombie = new RenderWorker({ ...deps, workerId: 'dead' });
    expect(await zombie.queue.heartbeat(id)).toBe('lost');
  });

  it('최근 heartbeat 가 있는 작업은 건드리지 않는다', async () => {
    const { agent } = await signedInAgent(app);
    const { projectId } = await projectWithTracks(agent);
    const { body } = await agent.post('/api/renders').send({ projectId }).expect(201);
    await prisma.renderJob.update({ where: { id: body.render.id }, data: { status: 'PROCESSING', attempts: 1, heartbeatAt: new Date(), workerId: 'alive' } });
    expect(await worker.queue.recoverStale(60_000, 3)).toBe(0);
    await agent.post(`/api/renders/${body.render.id}/cancel`).expect(200);
  });
});
