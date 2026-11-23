// API 응답 타입 (프론트엔드와 백엔드가 공유)

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: 'outpaly-api';
  time: string;
  db: { ok: boolean; latencyMs: number | null; error?: string };
  counts: { users: number; projects: number } | null;
}

export interface ApiError {
  error: { code: string; message: string };
}
