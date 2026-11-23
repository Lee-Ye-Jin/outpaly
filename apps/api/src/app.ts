import express from 'express';
import cors from 'cors';
import { env } from './config/env.ts';
import { healthRouter } from './modules/health/health.routes.ts';
import { errorHandler, notFound } from './middleware/error.ts';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', healthRouter);
  // Phase 2~: /api/auth, /api/projects, /api/tracks, /api/assets, /api/renders

  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
