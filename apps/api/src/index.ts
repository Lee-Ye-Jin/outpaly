import { env } from './config/env.ts';
import { createApp } from './app.ts';
import { prisma } from './lib/prisma.ts';

const server = createApp().listen(env.API_PORT, () => {
  console.log(`OutPaly API  http://localhost:${env.API_PORT}/api/health`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
