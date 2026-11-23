import type { z } from 'zod';
import { HttpError } from '../middleware/error.ts';

/** 요청 본문 검증. 실패하면 첫 번째 오류 메시지로 400 을 던진다 */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const r = schema.safeParse(body ?? {});
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new HttpError(400, 'VALIDATION', issue?.message ?? '입력값이 올바르지 않아요.', issue?.path.join('.'));
  }
  return r.data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v);
}
