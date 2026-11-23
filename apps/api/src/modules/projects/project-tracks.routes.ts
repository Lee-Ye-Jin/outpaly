// 프로젝트 안의 곡 (project_tracks)
//   POST   /api/projects/:id/tracks              곡 추가 (내 음악의 trackIds, 끝에 붙임)
//   PATCH  /api/projects/:id/tracks/reorder      순서 변경 (전체 순서)
//   PATCH  /api/projects/:id/tracks/:ptId        표시 제목·구간·볼륨·무음
//   DELETE /api/projects/:id/tracks/:ptId        프로젝트에서 빼기 (원본 음원은 남음)
// 모두 최신 곡 목록 전체를 돌려준다. 곡 편집은 updatedAt 만 바꾸고 revision(디자인 저장용)은 건드리지 않는다.

import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import {
  AddProjectTracksInput,
  MAX_TRACKS_PER_PROJECT,
  MIN_TRIMMED_SECONDS,
  ReorderProjectTracksInput,
  UpdateProjectTrackInput,
  type ProjectTracksResponse
} from '@outpaly/shared';
import { prisma } from '../../lib/prisma.ts';
import { isUuid, parseBody } from '../../lib/validate.ts';
import { HttpError } from '../../middleware/error.ts';
import { currentUser } from '../../middleware/auth.ts';
import { toProjectTrackDto } from '../tracks/dto.ts';

export const projectTracksRouter = Router({ mergeParams: true });

type Tx = Prisma.TransactionClient;
const projectNotFound = () => new HttpError(404, 'PROJECT_NOT_FOUND', '프로젝트를 찾을 수 없어요.');
const ptNotFound = () => new HttpError(404, 'PROJECT_TRACK_NOT_FOUND', '프로젝트에 그 곡이 없어요.');

/**
 * 내 프로젝트인지 확인하고 행을 잠근다 (FOR UPDATE).
 * 같은 프로젝트에 동시에 곡을 추가·정렬해도 sortOrder 가 꼬이지 않게 한다.
 */
async function lockOwnedProject(tx: Tx, userId: string, projectId: unknown): Promise<string> {
  if (!isUuid(projectId)) throw projectNotFound();
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM projects WHERE id = ${projectId}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw projectNotFound();
  return projectId;
}

async function listTracks(tx: Tx, projectId: string) {
  const rows = await tx.projectTrack.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: { track: true }
  });
  return rows.map(toProjectTrackDto);
}

async function touch(tx: Tx, projectId: string) {
  await tx.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
}

projectTracksRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const tracks = await prisma.$transaction(async (tx) => {
    const id = await lockOwnedProject(tx, user.id, (req.params as { id?: string }).id);
    return listTracks(tx, id);
  });
  const body: ProjectTracksResponse = { tracks };
  res.json(body);
});

projectTracksRouter.post('/', async (req, res) => {
  const user = currentUser(req);
  const input = parseBody(AddProjectTracksInput, req.body);

  const tracks = await prisma.$transaction(async (tx) => {
    const projectId = await lockOwnedProject(tx, user.id, (req.params as { id?: string }).id);

    // 내 음악만 넣을 수 있다
    const unique = [...new Set(input.trackIds)];
    const owned = await tx.track.count({ where: { id: { in: unique }, userId: user.id } });
    if (owned !== unique.length) throw new HttpError(404, 'TRACK_NOT_FOUND', '음악을 찾을 수 없어요.');

    const agg = await tx.projectTrack.aggregate({ where: { projectId }, _count: true, _max: { sortOrder: true } });
    if (agg._count + input.trackIds.length > MAX_TRACKS_PER_PROJECT) {
      throw new HttpError(400, 'TOO_MANY_TRACKS', `한 프로젝트에는 최대 ${MAX_TRACKS_PER_PROJECT}곡까지 넣을 수 있어요.`);
    }
    const start = (agg._max.sortOrder ?? -1) + 1;
    await tx.projectTrack.createMany({
      data: input.trackIds.map((trackId, i) => ({ projectId, trackId, sortOrder: start + i }))
    });
    await touch(tx, projectId);
    return listTracks(tx, projectId);
  });

  const body: ProjectTracksResponse = { tracks };
  res.status(201).json(body);
});

projectTracksRouter.patch('/reorder', async (req, res) => {
  const user = currentUser(req);
  const input = parseBody(ReorderProjectTracksInput, req.body);

  const tracks = await prisma.$transaction(async (tx) => {
    const projectId = await lockOwnedProject(tx, user.id, (req.params as { id?: string }).id);
    const current = await tx.projectTrack.findMany({ where: { projectId }, select: { id: true } });

    // 현재 곡 전체를 빠짐없이, 중복 없이 보냈는지 (다른 탭에서 곡을 추가·삭제했다면 409)
    const have = new Set(current.map((c) => c.id));
    const sent = new Set(input.order);
    const sameSet = sent.size === input.order.length && sent.size === have.size && [...sent].every((id) => have.has(id));
    if (!sameSet) {
      throw new HttpError(409, 'TRACKS_CHANGED', '곡 목록이 바뀌었어요. 새로고침 후 다시 시도해 주세요.');
    }

    for (const [i, id] of input.order.entries()) {
      await tx.projectTrack.update({ where: { id }, data: { sortOrder: i } });
    }
    await touch(tx, projectId);
    return listTracks(tx, projectId);
  });

  const body: ProjectTracksResponse = { tracks };
  res.json(body);
});

projectTracksRouter.patch('/:ptId', async (req, res) => {
  const user = currentUser(req);
  const input = parseBody(UpdateProjectTrackInput, req.body);
  const ptId = req.params.ptId;
  if (!isUuid(ptId)) throw ptNotFound();

  const tracks = await prisma.$transaction(async (tx) => {
    const projectId = await lockOwnedProject(tx, user.id, (req.params as { id?: string }).id);
    const pt = await tx.projectTrack.findFirst({ where: { id: ptId, projectId }, include: { track: true } });
    if (!pt) throw ptNotFound();

    // 구간은 원본 길이 안에서, 최소 1초는 남아야 한다
    const duration = pt.track.duration;
    const trimStart = input.trimStart ?? pt.trimStart;
    const trimEnd = input.trimEnd !== undefined ? input.trimEnd : pt.trimEnd;
    const end = trimEnd ?? duration;
    if (trimEnd !== null && trimEnd > duration + 0.001) {
      throw new HttpError(400, 'VALIDATION', '끝 지점이 곡 길이보다 길어요.', 'trimEnd');
    }
    if (end - trimStart < MIN_TRIMMED_SECONDS) {
      throw new HttpError(400, 'VALIDATION', `구간은 최소 ${MIN_TRIMMED_SECONDS}초 이상이어야 해요.`, 'trimStart');
    }

    await tx.projectTrack.update({
      where: { id: pt.id },
      data: {
        ...(input.displayTitle !== undefined ? { displayTitle: input.displayTitle } : {}),
        ...(input.displayArtist !== undefined ? { displayArtist: input.displayArtist } : {}),
        trimStart,
        trimEnd: trimEnd !== null && Math.abs(trimEnd - duration) < 0.001 ? null : trimEnd,
        ...(input.gain !== undefined ? { gain: input.gain } : {}),
        ...(input.gapAfter !== undefined ? { gapAfter: input.gapAfter } : {})
      }
    });
    await touch(tx, projectId);
    return listTracks(tx, projectId);
  });

  const body: ProjectTracksResponse = { tracks };
  res.json(body);
});

projectTracksRouter.delete('/:ptId', async (req, res) => {
  const user = currentUser(req);
  const ptId = req.params.ptId;
  if (!isUuid(ptId)) throw ptNotFound();

  const tracks = await prisma.$transaction(async (tx) => {
    const projectId = await lockOwnedProject(tx, user.id, (req.params as { id?: string }).id);
    const { count } = await tx.projectTrack.deleteMany({ where: { id: ptId, projectId } });
    if (count === 0) throw ptNotFound();
    // 빈 번호 없이 0,1,2… 로 다시 매긴다
    const rest = await tx.projectTrack.findMany({ where: { projectId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true } });
    for (const [i, r] of rest.entries()) await tx.projectTrack.update({ where: { id: r.id }, data: { sortOrder: i } });
    await touch(tx, projectId);
    return listTracks(tx, projectId);
  });

  const body: ProjectTracksResponse = { tracks };
  res.json(body);
});
