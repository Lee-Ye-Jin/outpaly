import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiError } from '@outpaly/shared';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field?: string
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (_req, res) => {
  const body: ApiError = { error: { code: 'NOT_FOUND', message: '요청한 API 가 없습니다.' } };
  res.status(404).json(body);
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    const body: ApiError = { error: { code: err.code, message: err.message } };
    if (err.field) body.error.field = err.field;
    res.status(err.status).json(body);
    return;
  }
  // express.json() 의 잘못된 JSON
  if (err instanceof SyntaxError && 'body' in err) {
    const body: ApiError = { error: { code: 'BAD_JSON', message: '요청 본문이 올바른 JSON 이 아니에요.' } };
    res.status(400).json(body);
    return;
  }
  console.error(err);
  const body: ApiError = { error: { code: 'INTERNAL', message: '서버 오류가 발생했습니다.' } };
  res.status(500).json(body);
};
