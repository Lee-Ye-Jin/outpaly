import type { z } from 'zod';
import { ApiRequestError } from '../../services/api.ts';

export type FieldErrors = Partial<Record<string, string>>;

/** zod 오류 → 칸별 첫 번째 메시지 */
export function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_');
    out[key] ??= issue.message;
  }
  return out;
}

/** 서버 오류 → 칸 오류 또는 폼 전체 오류 */
export function splitServerError(e: unknown): { fields: FieldErrors; form: string | null } {
  if (e instanceof ApiRequestError) {
    if (e.field) return { fields: { [e.field]: e.message }, form: null };
    return { fields: {}, form: e.message };
  }
  return { fields: {}, form: '알 수 없는 오류가 발생했어요. 다시 시도해 주세요.' };
}
