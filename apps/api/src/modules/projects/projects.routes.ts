// 프로젝트 API (Phase 2: 목록·생성·상세. 수정·삭제는 Phase 3)
// 모든 조회는 userId 조건을 함께 건다. 다른 사람의 프로젝트는 "없는 것"으로 응답한다 (404, 존재 여부를 노출하지 않음).

import { Router } from 'express';
import type { Project } from '@prisma/client';
import {
  CreateProjectInput,
  ProjectSettings,
  createDefaultSettings,
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

type WithCount = Project & { _count: { tracks: number } };

const toSummary = (p: WithCount): ProjectSummary => ({
  id: p.id,
  title: p.title,
  trackCount: p._count.tracks,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString()
});

/** 내 프로젝트만 찾는다. 없거나 남의 것이면 404 */
export async function findOwnedProject(userId: string, id: unknown) {
  if (!isUuid(id)) throw new HttpError(404, 'PROJECT_NOT_FOUND', '프로젝트를 찾을 수 없어요.');
  const project = await prisma.project.findFirst({
    where: { id, userId },
    include: { _count: { select: { tracks: true } } }
  });
  if (!project) throw new HttpError(404, 'PROJECT_NOT_FOUND', '프로젝트를 찾을 수 없어요.');
  return project;
}

projectsRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { tracks: true } } }
  });
  const body: ProjectListResponse = { projects: projects.map(toSummary) };
  res.json(body);
});

projectsRouter.post('/', async (req, res) => {
  const user = currentUser(req);
  const input = parseBody(CreateProjectInput, req.body);
  const project = await prisma.project.create({
    data: { userId: user.id, title: input.title, settings: createDefaultSettings(input.title) },
    include: { _count: { select: { tracks: true } } }
  });
  const body: ProjectResponse = {
    project: { ...toSummary(project), settings: ProjectSettings.parse(project.settings) }
  };
  res.status(201).json(body);
});

projectsRouter.get('/:id', async (req, res) => {
  const user = currentUser(req);
  const project = await findOwnedProject(user.id, req.params.id);
  const body: ProjectResponse = {
    project: { ...toSummary(project), settings: ProjectSettings.parse(project.settings) }
  };
  res.json(body);
});
