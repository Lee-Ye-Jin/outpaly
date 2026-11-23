import type {
  ApiError,
  AuthResponse,
  CreateProjectInput,
  HealthResponse,
  LoginInput,
  ProjectListResponse,
  ProjectResponse,
  RegisterInput
} from '@outpaly/shared';

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field?: string
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal
    });
  } catch (e) {
    if (init.signal?.aborted) throw e;
    throw new ApiRequestError(0, 'NETWORK', '서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.');
  }

  if (res.status === 204) return undefined as T;
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  const data: unknown = isJson ? await res.json() : null;

  if (!res.ok) {
    const err = (data as ApiError | null)?.error;
    throw new ApiRequestError(
      res.status,
      err?.code ?? 'HTTP_ERROR',
      err?.message ?? `요청을 처리하지 못했어요 (HTTP ${res.status}).`,
      err?.field
    );
  }
  return data as T;
}

/** 503 도 본문이 HealthResponse 이므로 상태 코드와 무관하게 읽는다 */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch('/api/health', { signal });
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    throw new Error(`API 서버에 연결할 수 없어요 (HTTP ${res.status})`);
  }
  return (await res.json()) as HealthResponse;
}

export const authApi = {
  me: (signal?: AbortSignal) => request<AuthResponse>('/api/auth/me', { signal }),
  login: (body: LoginInput) => request<AuthResponse>('/api/auth/login', { method: 'POST', body }),
  register: (body: RegisterInput) => request<AuthResponse>('/api/auth/register', { method: 'POST', body }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' })
};

export const projectsApi = {
  list: (signal?: AbortSignal) => request<ProjectListResponse>('/api/projects', { signal }),
  create: (body: CreateProjectInput) => request<ProjectResponse>('/api/projects', { method: 'POST', body }),
  get: (id: string, signal?: AbortSignal) => request<ProjectResponse>(`/api/projects/${encodeURIComponent(id)}`, { signal })
};
