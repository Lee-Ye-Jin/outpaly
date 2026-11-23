import { Router } from 'express';
import type { HealthResponse } from '@outpaly/shared';
import { prisma } from '../../lib/prisma.ts';

export const healthRouter = Router();

/** 서버와 DB 상태. DB 에 닿지 못하면 503 + status "degraded" */
healthRouter.get('/', async (_req, res) => {
  const body: HealthResponse = {
    status: 'ok',
    service: 'outpaly-api',
    time: new Date().toISOString(),
    db: { ok: false, latencyMs: null },
    counts: null
  };

  try {
    const t0 = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    body.db = { ok: true, latencyMs: Math.round(performance.now() - t0) };
    const [users, projects] = await Promise.all([prisma.user.count(), prisma.project.count()]);
    body.counts = { users, projects };
  } catch (err) {
    body.status = 'degraded';
    body.db.error = err instanceof Error ? err.message.split('\n').filter(Boolean).at(-1) : 'unknown error';
  }

  res.status(body.status === 'ok' ? 200 : 503).json(body);
});
