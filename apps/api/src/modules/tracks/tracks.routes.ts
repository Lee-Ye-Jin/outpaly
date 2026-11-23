// 내 음악(원본 음원) API
//   POST /upload-url  → 업로드 주소 발급 (S3 presigned URL 과 같은 흐름)
//   (브라우저가 그 주소로 파일을 PUT)
//   POST /complete    → 파일 내용 검사 후 tracks 에 등록
//   GET  /            → 내 음악 목록
//   GET  /:id/stream  → 재생 (Range 지원)
//   DELETE /:id       → 삭제 (프로젝트에서 쓰는 중이면 409)

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  ACCEPTED_AUDIO,
  CompleteTrackUploadInput,
  MAX_TRACK_BYTES,
  RequestTrackUploadInput,
  titleFromFilename,
  type TrackListResponse,
  type TrackResponse,
  type UploadTarget
} from '@outpaly/shared';
import { prisma } from '../../lib/prisma.ts';
import { storage, userPrefix } from '../../lib/storage/index.ts';
import { isUuid, parseBody } from '../../lib/validate.ts';
import { HttpError } from '../../middleware/error.ts';
import { currentUser, requireAuth } from '../../middleware/auth.ts';
import { analyzeAudio, UnsupportedAudioError } from './audio.ts';
import { toTrackDto } from './dto.ts';

export const tracksRouter = Router();
tracksRouter.use(requireAuth);

const UPLOAD_URL_TTL_SECONDS = 15 * 60;
const trackKeyPrefix = (userId: string) => `${userPrefix(userId)}tracks/`;
const notFound = () => new HttpError(404, 'TRACK_NOT_FOUND', '음악을 찾을 수 없어요.');

async function findOwnedTrack(userId: string, id: unknown) {
  if (!isUuid(id)) throw notFound();
  const track = await prisma.track.findFirst({ where: { id, userId } });
  if (!track) throw notFound();
  return track;
}

tracksRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const tracks = await prisma.track.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
  const body: TrackListResponse = { tracks: tracks.map(toTrackDto) };
  res.json(body);
});

tracksRouter.post('/upload-url', async (req, res) => {
  const user = currentUser(req);
  const input = parseBody(RequestTrackUploadInput, req.body);
  const ext = ACCEPTED_AUDIO[input.mimeType][0];
  const key = `${trackKeyPrefix(user.id)}${randomUUID()}${ext}`;
  const target = await storage.createUploadTarget({
    key,
    contentType: input.mimeType,
    maxBytes: MAX_TRACK_BYTES,
    expiresIn: UPLOAD_URL_TTL_SECONDS
  });
  const body: UploadTarget = { key, url: target.url, method: target.method, headers: target.headers, expiresAt: target.expiresAt.toISOString() };
  res.status(201).json(body);
});

tracksRouter.post('/complete', async (req, res) => {
  const user = currentUser(req);
  const input = parseBody(CompleteTrackUploadInput, req.body);

  // 내 폴더의 키인지 확인 (다른 사용자의 파일을 내 것으로 등록하지 못하게)
  if (!input.key.startsWith(trackKeyPrefix(user.id)) || input.key.includes('..')) {
    throw new HttpError(403, 'FORBIDDEN_KEY', '이 파일을 등록할 수 없어요.');
  }
  const existing = await prisma.track.findFirst({ where: { storageKey: input.key, userId: user.id } });
  if (existing) {
    const body: TrackResponse = { track: toTrackDto(existing) };
    res.json(body); // 같은 파일로 두 번 complete → 이미 등록된 것을 돌려준다
    return;
  }
  const stat = await storage.stat(input.key);
  if (!stat) throw new HttpError(400, 'UPLOAD_MISSING', '업로드된 파일이 없어요. 다시 업로드해 주세요.');

  let info;
  try {
    info = await storage.withLocalFile(input.key, analyzeAudio);
  } catch (e) {
    if (e instanceof UnsupportedAudioError) {
      await storage.delete(input.key);
      throw new HttpError(400, 'UNSUPPORTED_AUDIO', e.message);
    }
    throw e;
  }

  const track = await prisma.track.create({
    data: {
      userId: user.id,
      title: info.title ?? titleFromFilename(input.filename),
      artist: info.artist,
      storageKey: input.key,
      mimeType: info.mimeType,
      sizeBytes: BigInt(stat.size),
      duration: info.duration
    }
  });
  const body: TrackResponse = { track: toTrackDto(track) };
  res.status(201).json(body);
});

tracksRouter.get('/:id/stream', async (req, res) => {
  const user = currentUser(req);
  const track = await findOwnedTrack(user.id, req.params.id);
  await storage.sendFile(res, track.storageKey, track.mimeType);
});

tracksRouter.delete('/:id', async (req, res) => {
  const user = currentUser(req);
  const track = await findOwnedTrack(user.id, req.params.id);
  const usedIn = await prisma.project.findMany({
    where: { userId: user.id, tracks: { some: { trackId: track.id } } },
    select: { title: true },
    take: 5
  });
  if (usedIn.length > 0) {
    throw new HttpError(
      409,
      'TRACK_IN_USE',
      `이 음악을 쓰는 프로젝트가 있어요: ${usedIn.map((p) => p.title).join(', ')}. 프로젝트에서 먼저 빼 주세요.`
    );
  }
  await prisma.track.delete({ where: { id: track.id } });
  await storage.delete(track.storageKey);
  res.status(204).end();
});
