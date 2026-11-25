import type { RenderJobListResponse, RenderJobResponse } from '@outpaly/shared';
import { request } from './api.ts';

export const rendersApi = {
  create: (projectId: string) => request<RenderJobResponse>('/api/renders', { method: 'POST', body: { projectId } }),
  get: (id: string, signal?: AbortSignal) => request<RenderJobResponse>(`/api/renders/${encodeURIComponent(id)}`, { signal }),
  cancel: (id: string) => request<RenderJobResponse>(`/api/renders/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  listForProject: (projectId: string, signal?: AbortSignal) =>
    request<RenderJobListResponse>(`/api/projects/${encodeURIComponent(projectId)}/renders`, { signal })
};
