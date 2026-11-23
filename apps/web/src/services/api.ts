import type { HealthResponse } from '@outpaly/shared';

/** 503 도 본문이 HealthResponse 이므로 상태 코드와 무관하게 읽는다 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch('/api/health', { signal });
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    throw new Error(`API 서버에 연결할 수 없어요 (HTTP ${res.status})`);
  }
  return (await res.json()) as HealthResponse;
}
