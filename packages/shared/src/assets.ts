// 배경 이미지(assets) 타입과 입력 검증

import { z } from 'zod';

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB
/** 가로·세로 최대 픽셀. 이보다 크면 브라우저 미리보기가 느려지고 메모리를 많이 쓴다 */
export const MAX_IMAGE_SIDE = 8000;
export const MIN_IMAGE_SIDE = 16;

export const ACCEPTED_IMAGES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp']
} as const;
export type AcceptedImageMime = keyof typeof ACCEPTED_IMAGES;
export const ACCEPTED_IMAGE_MIMES = Object.keys(ACCEPTED_IMAGES) as AcceptedImageMime[];
export const IMAGE_ACCEPT_ATTR = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';

export const RequestAssetUploadInput = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.enum(ACCEPTED_IMAGE_MIMES as [AcceptedImageMime, ...AcceptedImageMime[]], {
    error: 'JPG, PNG, WebP 이미지만 올릴 수 있어요.'
  }),
  sizeBytes: z
    .number()
    .int()
    .positive({ error: '빈 파일은 올릴 수 없어요.' })
    .max(MAX_IMAGE_BYTES, { error: `이미지가 너무 커요. 최대 ${MAX_IMAGE_BYTES / 1024 / 1024}MB 예요.` })
});
export type RequestAssetUploadInput = z.input<typeof RequestAssetUploadInput>;

export const CompleteAssetUploadInput = z.object({
  key: z.string().min(1).max(500)
});
export type CompleteAssetUploadInput = z.input<typeof CompleteAssetUploadInput>;

export interface AssetDto {
  id: string;
  type: 'IMAGE';
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  /** 브라우저에서 불러올 주소 (로그인한 본인만) */
  url: string;
  createdAt: string;
}

export interface AssetResponse {
  asset: AssetDto;
}
export interface AssetListResponse {
  assets: AssetDto[];
}

/** 렌더 스냅샷에 들어가는 배경 원본 */
export interface RenderBackgroundSource {
  storageKey: string;
  mimeType: string;
}
