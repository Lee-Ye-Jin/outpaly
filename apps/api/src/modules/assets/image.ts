// 업로드된 배경 이미지를 검사하고 "깨끗한" 파일로 다시 저장한다.
//
// 왜 다시 저장하나:
// 1. 휴대폰 사진의 회전 정보(EXIF orientation)를 실제 픽셀에 반영 → 브라우저 미리보기와 서버 렌더가 같은 방향
//    (@napi-rs/canvas 의 loadImage 는 orientation 을 적용해서 읽는다 — 2026-11-26 확인)
// 2. 촬영 위치(GPS) 같은 메타데이터 제거 → 사용자의 위치가 파일에 남지 않는다
// 3. 실제로 열리는 이미지인지 확인 (확장자·Content-Type 은 믿지 않는다)

import fs from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { MAX_IMAGE_SIDE, MIN_IMAGE_SIDE, type AcceptedImageMime } from '@outpaly/shared';

export class UnsupportedImageError extends Error {}

/** 파일 앞부분(매직 넘버)으로 실제 형식 판별 */
export function sniffImage(head: Buffer): AcceptedImageMime | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (head.length >= 12 && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export interface NormalizedImage {
  mimeType: AcceptedImageMime;
  width: number;
  height: number;
  size: number;
}

/** filePath 를 검사하고 같은 자리에 정리된 이미지로 덮어쓴다 */
export async function normalizeImage(filePath: string): Promise<NormalizedImage> {
  const original = await fs.readFile(filePath);
  const mimeType = sniffImage(original.subarray(0, 16));
  if (!mimeType) throw new UnsupportedImageError('JPG, PNG, WebP 이미지만 올릴 수 있어요.');

  let img;
  try {
    img = await loadImage(original);
  } catch {
    throw new UnsupportedImageError('이미지를 열 수 없어요. 손상된 파일인 것 같아요.');
  }
  const { width, height } = img;
  if (width < MIN_IMAGE_SIDE || height < MIN_IMAGE_SIDE) {
    throw new UnsupportedImageError(`이미지가 너무 작아요 (최소 ${MIN_IMAGE_SIDE}px).`);
  }
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) {
    throw new UnsupportedImageError(`이미지가 너무 커요. 가로·세로 ${MAX_IMAGE_SIDE}px 이하로 올려 주세요.`);
  }

  const canvas = createCanvas(width, height);
  canvas.getContext('2d').drawImage(img, 0, 0);
  const out =
    mimeType === 'image/jpeg'
      ? await canvas.encode('jpeg', 92)
      : mimeType === 'image/webp'
        ? await canvas.encode('webp', 92)
        : await canvas.encode('png');

  const tmp = `${filePath}.norm`;
  await fs.writeFile(tmp, out);
  await fs.rename(tmp, filePath);
  return { mimeType, width, height, size: out.length };
}
