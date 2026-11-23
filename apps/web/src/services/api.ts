import type {
  ApiError,
  AuthResponse,
  CreateProjectInput,
  HealthResponse,
  LoginInput,
  ProjectListResponse,
  ProjectResponse,
  RegisterInput,
  UpdateProjectInput
} from '@outpaly/shared';

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field?: string,
    /** 오류 응답 본문 전체 (409 의 최신 project 등) */
    public body?: unknown
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  /** 페이지를 떠나는 중에도 요청을 끝까지 보낸다 (편집기 닫을 때 마지막 저장) */
  keepalive?: boolean;
}

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
      keepalive: init.keepalive
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
      err?.field,
      data
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

const projectPath = (id: string) => `/api/projects/${encodeURIComponent(id)}`;

export const projectsApi = {
  list: (signal?: AbortSignal) => request<ProjectListResponse>('/api/projects', { signal }),
  create: (body: CreateProjectInput) => request<ProjectResponse>('/api/projects', { method: 'POST', body }),
  get: (id: string, signal?: AbortSignal) => request<ProjectResponse>(projectPath(id), { signal }),
  update: (id: string, body: UpdateProjectInput, opts: { keepalive?: boolean } = {}) =>
    request<ProjectResponse>(projectPath(id), { method: 'PATCH', body, keepalive: opts.keepalive }),
  remove: (id: string) => request<void>(projectPath(id), { method: 'DELETE' }),
  duplicate: (id: string) => request<ProjectResponse>(`${projectPath(id)}/duplicate`, { method: 'POST' })
};
