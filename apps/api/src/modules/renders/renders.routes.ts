// 렌더링 API
//   POST /api/renders                  렌더 요청 (프로젝트 스냅샷을 찍어 대기열에 넣는다)
//   GET  /api/renders/:id              진행 상황
//   POST /api/renders/:id/cancel       취소
//   GET  /api/renders/:id/download     완성 MP4 다운로드
//   GET  /api/projects/:id/renders     프로젝트의 렌더 기록 (projects 라우터에서 연결)

import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { totalDuration } from '@outpaly/editor-core';
import {
  ACTIVE_RENDER_STATUSES,
  CreateRenderInput,
  ProjectSettings,
  createDefaultSettings,
  toProjectTrackDoc,
  type ProjectDoc,
  type RenderJobDto,
  type RenderJobListResponse,
  type RenderJobResponse,
  type RenderSnapshot
} from '@outpaly/shared';
import { prisma } from '../../lib/prisma.ts';
import { storage } from '../../lib/storage/index.ts';
import { isUuid, parseBody } from '../../lib/validate.ts';
import { HttpError } from '../../middleware/error.ts';
import { currentUser, requireAuth } from '../../middleware/auth.ts';
import { toProjectTrackDto } from '../tracks/dto.ts';

export const rendersRouter = Router();
rendersRouter.use(requireAuth);

const withOutput = { outputs: { orderBy: { createdAt: 'desc' }, take: 1 } } as const satisfies Prisma.RenderJobInclude;
type JobWithOutput = Prisma.RenderJobGetPayload<{ include: typeof withOutput }>;

export function toRenderDto(job: JobWithOutput): RenderJobDto {
  const snap = job.snapshot as unknown as RenderSnapshot;
  const out = job.outputs[0];
  return {
    id: job.id,
    projectId: job.projectId,
    status: job.status,
    progress: job.progress,
    error: job.error,
    trackCount: snap.doc.tracks.length,
    expectedDuration: totalDuration(snap.doc.tracks),
    width: snap.doc.output.width,
    height: snap.doc.output.height,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    output:
      job.status === 'COMPLETED' && out
        ? {
            id: out.id,
            sizeBytes: Number(out.sizeBytes),
            duration: out.duration,
            width: out.width,
            height: out.height,
            timestamps: out.timestamps,
            downloadUrl: `/api/renders/${job.id}/download`,
            createdAt: out.createdAt.toISOString()
          }
        : null
  };
}

const notFound = () => new HttpError(404, 'RENDER_NOT_FOUND', '렌더 작업을 찾을 수 없어요.');

async function findOwnedJob(userId: string, id: unknown) {
  if (!isUuid(id)) throw notFound();
  const job = await prisma.renderJob.findFirst({ where: { id, userId }, include: withOutput });
  if (!job) throw notFound();
  return job;
}

/** 파일 이름에 쓸 수 없는 문자 제거 */
export function safeFilename(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  return `${cleaned || 'outpaly'}.mp4`;
}

rendersRouter.post('/', async (req, res) => {
  const user = currentUser(req);
  const { projectId } = parseBody(CreateRenderInput, req.body);

  const result = await prisma.$transaction(async (tx) => {
    // 프로젝트 행을 잠가 같은 프로젝트의 렌더 요청이 동시에 두 개 생기지 않게 한다
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM projects WHERE id = ${projectId}::uuid AND user_id = ${user.id}::uuid FOR UPDATE`;
    if (locked.length === 0) throw new HttpError(404, 'PROJECT_NOT_FOUND', '프로젝트를 찾을 수 없어요.');

    const active = await tx.renderJob.findFirst({
      where: { projectId, status: { in: [...ACTIVE_RENDER_STATUSES] } },
      include: withOutput
    });
    if (active) return { existing: active };

    const project = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { tracks: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: { track: true } } }
    });
    if (project.tracks.length === 0) {
      throw new HttpError(400, 'NO_TRACKS', '곡을 한 곡 이상 추가해야 영상을 만들 수 있어요.');
    }

    const parsed = ProjectSettings.safeParse(project.settings);
    const settings = parsed.success ? parsed.data : createDefaultSettings(project.title);
    const doc: ProjectDoc = { ...settings, title: project.title, tracks: project.tracks.map((t) => toProjectTrackDoc(toProjectTrackDto(t))) };

    // 배경 이미지: 설정에 있는데 지워졌으면(있으면 안 되지만) 단색으로 만들지 않고 알린다
    let background: RenderSnapshot['background'] = null;
    if (settings.background.assetId) {
      const asset = await tx.asset.findFirst({ where: { id: settings.background.assetId, userId: user.id } });
      if (!asset) throw new HttpError(400, 'BACKGROUND_MISSING', '배경 이미지를 찾을 수 없어요. 편집기에서 배경을 다시 골라 주세요.');
      background = { storageKey: asset.storageKey, mimeType: asset.mimeType };
    }
    const snapshot: RenderSnapshot = {
      version: 1,
      doc,
      sources: Object.fromEntries(project.tracks.map((t) => [t.id, { storageKey: t.track.storageKey, mimeType: t.track.mimeType }])),
      background
    };

    const job = await tx.renderJob.create({
      data: { projectId, userId: user.id, snapshot: snapshot as unknown as Prisma.InputJsonValue },
      include: withOutput
    });
    return { created: job };
  });

  if ('existing' in result) {
    res.status(409).json({
      error: { code: 'RENDER_IN_PROGRESS', message: '이 프로젝트는 이미 영상을 만들고 있어요.' },
      render: toRenderDto(result.existing!)
    });
    return;
  }
  const body: RenderJobResponse = { render: toRenderDto(result.created) };
  res.status(201).json(body);
});

rendersRouter.get('/:id', async (req, res) => {
  const user = currentUser(req);
  const body: RenderJobResponse = { render: toRenderDto(await findOwnedJob(user.id, req.params.id)) };
  res.json(body);
});

rendersRouter.post('/:id/cancel', async (req, res) => {
  const user = currentUser(req);
  const job = await findOwnedJob(user.id, req.params.id);

  // 아직 대기 중이면 바로 취소, 처리 중이면 Worker 에게 취소 요청 (Worker 가 FFmpeg 를 멈추고 CANCELLED 로 바꾼다)
  const queued = await prisma.renderJob.updateMany({
    where: { id: job.id, status: 'QUEUED' },
    data: { status: 'CANCELLED', cancelRequested: true, finishedAt: new Date() }
  });
  if (queued.count === 0) {
    const running = await prisma.renderJob.updateMany({
      where: { id: job.id, status: { in: ['PREPARING', 'PROCESSING', 'UPLOADING'] } },
      data: { cancelRequested: true }
    });
    if (running.count === 0) throw new HttpError(409, 'RENDER_FINISHED', '이미 끝난 작업이에요.');
  }
  const body: RenderJobResponse = { render: toRenderDto(await findOwnedJob(user.id, job.id)) };
  res.json(body);
});

rendersRouter.get('/:id/download', async (req, res) => {
  const user = currentUser(req);
  const job = await findOwnedJob(user.id, req.params.id);
  const out = job.outputs[0];
  if (job.status !== 'COMPLETED' || !out) throw new HttpError(409, 'RENDER_NOT_READY', '아직 영상이 완성되지 않았어요.');
  const snap = job.snapshot as unknown as RenderSnapshot;
  await storage.sendFile(res, out.storageKey, { contentType: 'video/mp4', downloadName: safeFilename(snap.doc.title) });
});

/** /api/projects/:id/renders — 최근 10개 */
export const projectRendersRouter = Router({ mergeParams: true });
projectRendersRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const projectId = (req.params as { id?: string }).id;
  if (!isUuid(projectId)) throw new HttpError(404, 'PROJECT_NOT_FOUND', '프로젝트를 찾을 수 없어요.');
  const owned = await prisma.project.count({ where: { id: projectId, userId: user.id } });
  if (!owned) throw new HttpError(404, 'PROJECT_NOT_FOUND', '프로젝트를 찾을 수 없어요.');
  const jobs = await prisma.renderJob.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: withOutput
  });
  const body: RenderJobListResponse = { renders: jobs.map(toRenderDto) };
  res.json(body);
});
