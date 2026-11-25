// 배경 이미지 API (음악 업로드와 같은 3단계)
//   POST /upload-url → PUT → POST /complete (이미지를 열어 검사하고 메타데이터 없는 파일로 다시 저장)
//   GET  /            → 내 이미지 목록
//   GET  /:id/file    → 이미지 (미리보기·썸네일)
//   DELETE /:id       → 삭제 (프로젝트 배경으로 쓰는 중이거나 렌더가 쓰는 중이면 409)

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { Asset } from '@prisma/client';
import {
  ACCEPTED_IMAGES,
  CompleteAssetUploadInput,
  MAX_IMAGE_BYTES,
  RequestAssetUploadInput,
  type AssetDto,
  type AssetListResponse,
  type AssetResponse,
  type UploadTarget
} from '@outpaly/shared';
import { prisma } from '../../lib/prisma.ts';
import { assetKeyPrefix, storage } from '../../lib/storage/index.ts';
import { isUuid, parseBody } from '../../lib/validate.ts';
import { HttpError } from '../../middleware/error.ts';
import { currentUser, requireAuth } from '../../middleware/auth.ts';
import { normalizeImage, UnsupportedImageError } from './image.ts';

export const assetsRouter = Router();
assetsRouter.use(requireAuth);

export const toAssetDto = (a: Asset): AssetDto => ({
  id: a.id,
  type: 'IMAGE',
  mimeType: a.mimeType,
  sizeBytes: Number(a.sizeBytes),
  width: a.width ?? 0,
  height: a.height ?? 0,
  url: `/api/assets/${a.id}/file`,
  createdAt: a.createdAt.toISOString()
});

const notFound = () => new HttpError(404, 'ASSET_NOT_FOUND', '이미지를 찾을 수 없어요.');

/** 내 이미지만. 없거나 남의 것이면 null (호출한 쪽이 404 또는 400 을 고른다) */
export async function findOwnedAsset(userId: string, id: unknown) {
  if (!isUuid(id)) return null;
  return prisma.asset.findFirst({ where: { id, userId, type: 'IMAGE' } });
}

assetsRouter.get('/', async (req, res) => {
  const user = currentUser(req);
  const assets = await prisma.asset.findMany({ where: { userId: user.id, type: 'IMAGE' }, orderBy: { createdAt: 'desc' } });
  const body: AssetListResponse = { assets: assets.map(toAssetDto) };
  res.json(body);
});

assetsRouter.post('/upload-url', async (req, res) => {
  const user = currentUser(req);
  const input = parseBody(RequestAssetUploadInput, req.body);
  const key = `${assetKeyPrefix(user.id)}${randomUUID()}${ACCEPTED_IMAGES[input.mimeType][0]}`;
  const target = await storage.createUploadTarget({ key, contentType: input.mimeType, maxBytes: MAX_IMAGE_BYTES, expiresIn: 15 * 60 });
  const body: UploadTarget = { key, url: target.url, method: target.method, headers: target.headers, expiresAt: target.expiresAt.toISOString() };
  res.status(201).json(body);
});

assetsRouter.post('/complete', async (req, res) => {
  const user = currentUser(req);
  const input = parseBody(CompleteAssetUploadInput, req.body);
  if (!input.key.startsWith(assetKeyPrefix(user.id)) || input.key.includes('..')) {
    throw new HttpError(403, 'FORBIDDEN_KEY', '이 파일을 등록할 수 없어요.');
  }
  const existing = await prisma.asset.findFirst({ where: { storageKey: input.key, userId: user.id } });
  if (existing) {
    const body: AssetResponse = { asset: toAssetDto(existing) };
    res.json(body);
    return;
  }
  if (!(await storage.stat(input.key))) throw new HttpError(400, 'UPLOAD_MISSING', '업로드된 파일이 없어요. 다시 업로드해 주세요.');

  let info;
  try {
    info = await storage.withLocalFile(input.key, normalizeImage);
  } catch (e) {
    if (e instanceof UnsupportedImageError) {
      await storage.delete(input.key);
      throw new HttpError(400, 'UNSUPPORTED_IMAGE', e.message);
    }
    throw e;
  }

  const asset = await prisma.asset.create({
    data: {
      userId: user.id,
      type: 'IMAGE',
      storageKey: input.key,
      mimeType: info.mimeType,
      sizeBytes: BigInt(info.size),
      width: info.width,
      height: info.height
    }
  });
  const body: AssetResponse = { asset: toAssetDto(asset) };
  res.status(201).json(body);
});

assetsRouter.get('/:id/file', async (req, res) => {
  const user = currentUser(req);
  const asset = await findOwnedAsset(user.id, req.params.id);
  if (!asset) throw notFound();
  await storage.sendFile(res, asset.storageKey, { contentType: asset.mimeType });
});

assetsRouter.delete('/:id', async (req, res) => {
  const user = currentUser(req);
  const asset = await findOwnedAsset(user.id, req.params.id);
  if (!asset) throw notFound();

  const usedIn = await prisma.$queryRaw<{ title: string }[]>`
    SELECT title FROM projects
     WHERE user_id = ${user.id}::uuid AND settings -> 'background' ->> 'assetId' = ${asset.id}
     LIMIT 5`;
  if (usedIn.length > 0) {
    throw new HttpError(
      409,
      'ASSET_IN_USE',
      `이 이미지를 배경으로 쓰는 프로젝트가 있어요: ${usedIn.map((p) => p.title).join(', ')}. 배경을 바꾼 뒤 지워 주세요.`
    );
  }
  const inRender = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM render_jobs
     WHERE user_id = ${user.id}::uuid
       AND status IN ('QUEUED', 'PREPARING', 'PROCESSING', 'UPLOADING')
       AND position(${asset.storageKey} in snapshot::text) > 0`;
  if (Number(inRender[0]?.n ?? 0) > 0) {
    throw new HttpError(409, 'ASSET_IN_RENDER', '이 이미지로 영상을 만드는 중이에요. 완료된 뒤 삭제해 주세요.');
  }

  await prisma.asset.delete({ where: { id: asset.id } });
  await storage.delete(asset.storageKey);
  res.status(204).end();
});
