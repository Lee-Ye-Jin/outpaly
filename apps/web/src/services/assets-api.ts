import { ACCEPTED_IMAGES, MAX_IMAGE_BYTES, type AcceptedImageMime, type AssetDto, type AssetListResponse, type AssetResponse, type UploadTarget } from '@outpaly/shared';
import { request } from './api.ts';
import { putFile } from './tracks-api.ts';

export const assetsApi = {
  list: (signal?: AbortSignal) => request<AssetListResponse>('/api/assets', { signal }),
  remove: (id: string) => request<void>(`/api/assets/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  fileUrl: (id: string) => `/api/assets/${encodeURIComponent(id)}/file`
};

export function detectImageMime(file: File): AcceptedImageMime | null {
  if (file.type in ACCEPTED_IMAGES) return file.type as AcceptedImageMime;
  const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return null;
}

/** 이미지 업로드 3단계 (주소 발급 → PUT → 서버 검사). 실패하면 Error(message) */
export async function uploadImage(file: File, onProgress: (r: number) => void): Promise<AssetDto> {
  const mimeType = detectImageMime(file);
  if (!mimeType) throw new Error('JPG, PNG, WebP 이미지만 올릴 수 있어요.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`이미지가 너무 커요. 최대 ${MAX_IMAGE_BYTES / 1024 / 1024}MB 예요.`);
  const target = await request<UploadTarget>('/api/assets/upload-url', {
    method: 'POST',
    body: { filename: file.name, mimeType, sizeBytes: file.size }
  });
  await putFile(target, file, onProgress);
  const { asset } = await request<AssetResponse>('/api/assets/complete', { method: 'POST', body: { key: target.key } });
  return asset;
}
