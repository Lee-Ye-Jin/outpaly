import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.ts';
import { healthRouter } from './modules/health/health.routes.ts';
import { authRouter } from './modules/auth/auth.routes.ts';
import { projectsRouter } from './modules/projects/projects.routes.ts';
import { loadSession } from './middleware/auth.ts';
import { checkOrigin } from './middleware/origin.ts';
import { errorHandler, notFound } from './middleware/error.ts';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // 배포 시 로드밸런서/CloudFront 뒤에 있으면 실제 IP 로 rate limit 하도록 설정
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);

  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', checkOrigin, loadSession);

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/projects', projectsRouter);
  // Phase 3~: /api/tracks, /api/assets, /api/renders

  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
