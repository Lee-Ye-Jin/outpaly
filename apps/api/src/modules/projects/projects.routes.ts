// 프로젝트 API
// 모든 조회·변경은 userId 조건을 함께 건다. 다른 사람의 프로젝트는 "없는 것"으로 응답한다 (404, 존재 여부를 노출하지 않음).

import { Router } from 'express';
import type { Prisma, Project } from '@prisma/client';
import { totalDuration } from '@outpaly/editor-core';
import {
  CreateProjectInput,
  ProjectSettings,
  UpdateProjectInput,
  createDefaultSettings,
  type ProjectConflictResponse,
  type ProjectDetail,
  type ProjectListResponse,
  type ProjectResponse,
  type ProjectSummary
} from '@outpaly/shared';
import { prisma } from '../../lib/prisma.ts';
import { storage } from '../../lib/storage/index.ts';
import { isUuid, parseBody } from '../../lib/validate.ts';
import { HttpError } from '../../middleware/error.ts';
import { currentUser, requireAuth } from '../../middleware/auth.ts';
import { toProjectTrackDto } from '../tracks/dto.ts';
import { projectTracksRouter } from './project-tracks.routes.ts';
import { projectRendersRouter } from '../renders/renders.routes.ts';
import { findOwnedAsset } from '../assets/assets.routes.ts';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);
projectsRouter.use('/:id/tracks', projectTracksRouter);
projectsRouter.use('/:id/renders', projectRendersRouter);

/** 목록·상세에 공통으로 필요한 관계 */
const withTracks = {
  tracks: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: { track: true } },
  renderJobs: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, progress: true } }
} as const satisfies Prisma.ProjectInclude;
type ProjectWithTracks = Prisma.ProjectGetPayload<{ include: typeof withTracks }>;

/** DB 의 settings 가 손상됐거나 예전 형식이면 기본값으로 대체 (편집기가 열리지 않는 것보다 낫다) */
function readSettings(p: Project): ProjectSettings {
  const r = ProjectSettings.safeParse(p.settings);
  if (r.success) return r.data;
  console.warn(`project ${p.id}: settings 형식 오류, 기본값 사용`, r.error.issues[0]);
  return createDefaultSettings(p.title);
}

function toSummary(p: ProjectWithTracks): ProjectSummary {
  return {
    id: p.id,
    title: p.title,
    trackCount: p.tracks.length,
    totalDuration: totalDuration(
      p.tracks.map((t) => ({ sourceDuration: t.track.duration, trimStart: t.trimStart, trimEnd: t.trimEnd, gapAfter: t.gapAfter }))
    ),
    settings: readSettings(p),
    revision: p.revision,
    latestRender: p.renderJobs[0] ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString()
  };
}

export function toDetail(p: ProjectWithTracks): ProjectDetail {
  return { ...toSummary(p), tracks: p.tracks.map(toProjectTrackDto) };
}

const notFound = () => new HttpError(404, 'PROJECT_NOT_FOUND', '프로젝트를 찾을 수 없어요.');

/** 내 프로젝트만 찾는다. 없거나 남의 것이면 404 */
export async function findOwnedProject(userId: string, id: unknown) {
  if (!isUuid(id)) throw notFound();
  const project = await prisma.project.findFirst({ where: { id, userId }, include: withTracks });
  if (!project) throw notFound();
  return project;
}

projectsRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    include: withTracks
  });
  const body: ProjectListResponse = { projects: projects.map(toSummary) };
  res.json(body);
});

projectsRouter.post('/', async (req, res) => {
  const user = currentUser(req);
  const input = parseBody(CreateProjectInput, req.body);
  const project = await prisma.project.create({
    data: { userId: user.id, title: input.title, settings: createDefaultSettings(input.title) },
    include: withTracks
  });
  const body: ProjectResponse = { project: toDetail(project) };
  res.status(201).json(body);
});

projectsRouter.get('/:id', async (req, res) => {
  const user = currentUser(req);
  const body: ProjectResponse = { project: toDetail(await findOwnedProject(user.id, req.params.id)) };
  res.json(body);
});

projectsRouter.patch('/:id', async (req, res) => {
  const user = currentUser(req);
  const id = req.params.id;
  if (!isUuid(id)) throw notFound();
  const input = parseBody(UpdateProjectInput, req.body);

  // 배경 이미지는 내 것만 (남의 이미지 id 를 넣어 그 사람의 사진으로 영상을 만들지 못하게)
  const assetId = input.settings?.background.assetId;
  if (assetId && !(await findOwnedAsset(user.id, assetId))) {
    throw new HttpError(400, 'VALIDATION', '배경 이미지를 찾을 수 없어요. 다시 골라 주세요.', 'settings.background.assetId');
  }

  // 조건부 갱신: expectedRevision 이 있으면 서버 값과 같을 때만 쓴다 (낙관적 동시성 제어)
  const result = await prisma.project.updateMany({
    where: {
      id,
      userId: user.id,
      ...(input.expectedRevision !== undefined ? { revision: input.expectedRevision } : {})
    },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.settings !== undefined ? { settings: input.settings } : {}),
      revision: { increment: 1 },
      updatedAt: new Date()
    }
  });

  const current = await prisma.project.findFirst({ where: { id, userId: user.id }, include: withTracks });
  if (!current) throw notFound();
  if (result.count === 0) {
    const body: ProjectConflictResponse = {
      error: { code: 'CONFLICT', message: '다른 곳에서 먼저 수정됐어요. 최신 내용을 불러와 주세요.' },
      project: toDetail(current)
    };
    res.status(409).json(body);
    return;
  }
  const body: ProjectResponse = { project: toDetail(current) };
  res.json(body);
});

projectsRouter.delete('/:id', async (req, res) => {
  const user = currentUser(req);
  const id = req.params.id;
  if (!isUuid(id)) throw notFound();
  // project_tracks, render_jobs, render_outputs 는 CASCADE 로 함께 지워진다. 원본 음원(tracks)은 내 음악 목록에 남는다.
  // 렌더 결과 MP4 파일은 DB 밖에 있으므로 키를 먼저 모아 두었다가 지운다.
  const outputs = await prisma.renderOutput.findMany({
    where: { renderJob: { projectId: id, userId: user.id } },
    select: { storageKey: true }
  });
  const { count } = await prisma.project.deleteMany({ where: { id, userId: user.id } });
  if (count === 0) throw notFound();
  // 진행 중이던 렌더는 Worker 가 heartbeat 에서 "lost" 를 받고 멈춘다
  await Promise.all(outputs.map((o) => storage.delete(o.storageKey).catch((e: unknown) => console.warn('렌더 파일 삭제 실패', o.storageKey, e))));
  res.status(204).end();
});

projectsRouter.post('/:id/duplicate', async (req, res) => {
  const user = currentUser(req);
  const source = await findOwnedProject(user.id, req.params.id);

  const copy = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        userId: user.id,
        title: `${source.title} (사본)`.slice(0, 120),
        settings: readSettings(source)
      }
    });
    if (source.tracks.length > 0) {
      await tx.projectTrack.createMany({
        data: source.tracks.map(({ id: _id, projectId: _p, track: _t, ...t }) => ({ ...t, projectId: created.id }))
      });
    }
    return tx.project.findUniqueOrThrow({ where: { id: created.id }, include: withTracks });
  });

  const body: ProjectResponse = { project: toDetail(copy) };
  res.status(201).json(body);
});
