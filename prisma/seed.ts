// 개발용 시드: 데모 사용자 1명 + 프로젝트 1개. 여러 번 실행해도 결과가 같다.
// 데모 사용자는 비밀번호 해시가 비어 있어 로그인할 수 없다 (Phase 2 에서 실제 가입 구현).

import { PrismaClient } from '@prisma/client';
import { createDefaultSettings } from '@outpaly/shared';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'demo@outpaly.local' },
    update: {},
    create: { email: 'demo@outpaly.local', passwordHash: '!', displayName: 'Demo' }
  });

  const existing = await prisma.project.findFirst({ where: { userId: user.id, title: 'Late Night Lo-fi Vol.1' } });
  if (!existing) {
    const settings = createDefaultSettings('Late Night Lo-fi');
    settings.titleLayer.subtitle = '공부할 때 틀어두는 플레이리스트';
    await prisma.project.create({
      data: { userId: user.id, title: 'Late Night Lo-fi Vol.1', settings }
    });
  }

  const [users, projects] = await Promise.all([prisma.user.count(), prisma.project.count()]);
  console.log(`seed 완료: users=${users}, projects=${projects}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
