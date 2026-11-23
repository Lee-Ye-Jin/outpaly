import type {
  AddProjectTracksInput,
  CompleteTrackUploadInput,
  ProjectTracksResponse,
  RequestTrackUploadInput,
  TrackListResponse,
  TrackResponse,
  UpdateProjectTrackInput,
  UploadTarget
} from '@outpaly/shared';
import { ApiRequestError, request } from './api.ts';

export const tracksApi = {
  list: (signal?: AbortSignal) => request<TrackListResponse>('/api/tracks', { signal }),
  requestUpload: (body: RequestTrackUploadInput) => request<UploadTarget>('/api/tracks/upload-url', { method: 'POST', body }),
  complete: (body: CompleteTrackUploadInput) => request<TrackResponse>('/api/tracks/complete', { method: 'POST', body }),
  remove: (id: string) => request<void>(`/api/tracks/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  streamUrl: (id: string) => `/api/tracks/${encodeURIComponent(id)}/stream`
};

const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/tracks`;

export const projectTracksApi = {
  add: (projectId: string, body: AddProjectTracksInput) => request<ProjectTracksResponse>(base(projectId), { method: 'POST', body }),
  reorder: (projectId: string, order: string[]) =>
    request<ProjectTracksResponse>(`${base(projectId)}/reorder`, { method: 'PATCH', body: { order } }),
  update: (projectId: string, ptId: string, body: UpdateProjectTrackInput, opts: { keepalive?: boolean } = {}) =>
    request<ProjectTracksResponse>(`${base(projectId)}/${encodeURIComponent(ptId)}`, { method: 'PATCH', body, keepalive: opts.keepalive }),
  list: (projectId: string, signal?: AbortSignal) => request<ProjectTracksResponse>(base(projectId), { signal }),
  remove: (projectId: string, ptId: string) =>
    request<ProjectTracksResponse>(`${base(projectId)}/${encodeURIComponent(ptId)}`, { method: 'DELETE' })
};

/**
 * 발급받은 주소로 파일을 PUT. 진행률을 알려면 fetch 대신 XMLHttpRequest 를 쓴다.
 * S3 presigned URL 로 바뀌어도 이 함수는 그대로 쓴다.
 */
export function putFile(target: UploadTarget, file: File, onProgress: (ratio: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(target.method, target.url);
    for (const [k, v] of Object.entries(target.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `업로드에 실패했어요 (HTTP ${xhr.status}).`;
      try {
        message = (JSON.parse(xhr.responseText) as { error?: { message?: string } }).error?.message ?? message;
      } catch {
        // 본문이 JSON 이 아님 (S3 XML 오류 등)
      }
      reject(new ApiRequestError(xhr.status, 'UPLOAD_FAILED', message));
    };
    xhr.onerror = () => reject(new ApiRequestError(0, 'NETWORK', '업로드 중 연결이 끊겼어요.'));
    xhr.onabort = () => reject(new DOMException('업로드를 취소했어요.', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}
