// 프로젝트 API
// 모든 조회·변경은 userId 조건을 함께 건다. 다른 사람의 프로젝트는 "없는 것"으로 응답한다 (404, 존재 여부를 노출하지 않음).

import { Router } from 'express';
import type { Project } from '@prisma/client';
import {
  CreateProjectInput,
  ProjectSettings,
  UpdateProjectInput,
  createDefaultSettings,
  type ProjectConflictResponse,
  type ProjectListResponse,
  type ProjectResponse,
  type ProjectSummary
} from '@outpaly/shared';
import { prisma } from '../../lib/prisma.ts';
import { isUuid, parseBody } from '../../lib/validate.ts';
import { HttpError } from '../../middleware/error.ts';
import { currentUser, requireAuth } from '../../middleware/auth.ts';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

const withCount = { _count: { select: { tracks: true } } } as const;
type WithCount = Project & { _count: { tracks: number } };

/** DB 의 settings 가 손상됐거나 예전 형식이면 기본값으로 대체 (편집기가 열리지 않는 것보다 낫다) */
function readSettings(p: Project): ProjectSettings {
  const r = ProjectSettings.safeParse(p.settings);
  if (r.success) return r.data;
  console.warn(`project ${p.id}: settings 형식 오류, 기본값 사용`, r.error.issues[0]);
  return createDefaultSettings(p.title);
}

const toSummary = (p: WithCount): ProjectSummary => ({
  id: p.id,
  title: p.title,
  trackCount: p._count.tracks,
  settings: readSettings(p),
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString()
});

const notFound = () => new HttpError(404, 'PROJECT_NOT_FOUND', '프로젝트를 찾을 수 없어요.');

/** 내 프로젝트만 찾는다. 없거나 남의 것이면 404 */
export async function findOwnedProject(userId: string, id: unknown) {
  if (!isUuid(id)) throw notFound();
  const project = await prisma.project.findFirst({ where: { id, userId }, include: withCount });
  if (!project) throw notFound();
  return project;
}

projectsRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    include: withCount
  });
  const body: ProjectListResponse = { projects: projects.map(toSummary) };
  res.json(body);
});

projectsRouter.post('/', async (req, res) => {
  const user = currentUser(req);
  const input = parseBody(CreateProjectInput, req.body);
  const project = await prisma.project.create({
    data: { userId: user.id, title: input.title, settings: createDefaultSettings(input.title) },
    include: withCount
  });
  const body: ProjectResponse = { project: toSummary(project) };
  res.status(201).json(body);
});

projectsRouter.get('/:id', async (req, res) => {
  const user = currentUser(req);
  const body: ProjectResponse = { project: toSummary(await findOwnedProject(user.id, req.params.id)) };
  res.json(body);
});

projectsRouter.patch('/:id', async (req, res) => {
  const user = currentUser(req);
  const id = req.params.id;
  if (!isUuid(id)) throw notFound();
  const input = parseBody(UpdateProjectInput, req.body);

  // 조건부 갱신: expectedUpdatedAt 이 있으면 서버 값과 같을 때만 쓴다 (낙관적 동시성 제어)
  const result = await prisma.project.updateMany({
    where: {
      id,
      userId: user.id,
      ...(input.expectedUpdatedAt ? { updatedAt: new Date(input.expectedUpdatedAt) } : {})
    },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.settings !== undefined ? { settings: input.settings } : {}),
      updatedAt: new Date()
    }
  });

  const current = await prisma.project.findFirst({ where: { id, userId: user.id }, include: withCount });
  if (!current) throw notFound();
  if (result.count === 0) {
    const body: ProjectConflictResponse = {
      error: { code: 'CONFLICT', message: '다른 곳에서 먼저 수정됐어요. 최신 내용을 불러와 주세요.' },
      project: toSummary(current)
    };
    res.status(409).json(body);
    return;
  }
  const body: ProjectResponse = { project: toSummary(current) };
  res.json(body);
});

projectsRouter.delete('/:id', async (req, res) => {
  const user = currentUser(req);
  const id = req.params.id;
  if (!isUuid(id)) throw notFound();
  // project_tracks, render_jobs 는 CASCADE 로 함께 지워진다. 원본 음원(tracks)은 내 음악 목록에 남는다.
  const { count } = await prisma.project.deleteMany({ where: { id, userId: user.id } });
  if (count === 0) throw notFound();
  res.status(204).end();
});

projectsRouter.post('/:id/duplicate', async (req, res) => {
  const user = currentUser(req);
  const source = await findOwnedProject(user.id, req.params.id);
  const sourceTracks = await prisma.projectTrack.findMany({
    where: { projectId: source.id },
    orderBy: { sortOrder: 'asc' }
  });

  const copy = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        userId: user.id,
        title: `${source.title} (사본)`.slice(0, 120),
        settings: readSettings(source)
      }
    });
    if (sourceTracks.length > 0) {
      await tx.projectTrack.createMany({
        data: sourceTracks.map(({ id: _id, projectId: _p, ...t }) => ({ ...t, projectId: created.id }))
      });
    }
    return tx.project.findUniqueOrThrow({ where: { id: created.id }, include: withCount });
  });

  const body: ProjectResponse = { project: toSummary(copy) };
  res.status(201).json(body);
});
