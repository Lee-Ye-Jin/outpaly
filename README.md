# OutPaly — Playlist Video Studio

**Create. Mix. Play.** 음악 파일과 배경 이미지로 유튜브용 플레이리스트 영상(MP4)을 만드는 웹 서비스.

## 구조

```
apps/
  web/          React + Vite + Tailwind  (편집기 화면)
  api/          Express + Prisma         (인증, 프로젝트, 업로드, 렌더 요청)
  worker/       FFmpeg 렌더링 Worker      (Phase 6, 지금은 골격만)
packages/
  shared/       ProjectDoc 스키마(zod), API 타입
  editor-core/  곡 시작 시각·전체 길이·타임스탬프 계산
  render-core/  drawFrame() — 브라우저 미리보기와 서버 렌더가 같이 쓰는 프레임 그리기
prisma/         DB 스키마, 시드
spikes/
  ffmpeg-render/  렌더링 파이프라인 실험 (1시간 영상 약 3.5분, 길이 오차 0)
```

핵심 원칙: **화면은 `render-core`의 Canvas 코드가 그리고, FFmpeg는 완성된 프레임과 오디오를 합치기만 한다.** 그래서 미리보기와 결과 MP4가 같은 코드에서 나온다.

## 시작하기

요구 사항: Node.js 22+, PostgreSQL 16+ (로컬 설치 또는 `docker compose up -d postgres`)

```bash
npm install
cp .env.example .env          # DATABASE_URL 의 비밀번호를 내 PostgreSQL 에 맞게 수정

npm run db:migrate            # DB 만들기 + 테이블 생성 (처음 한 번)
npm run db:seed               # 데모 사용자·프로젝트

npm run dev                   # API http://localhost:4000 + 웹 http://localhost:5173
```

웹 첫 화면에서 API 서버, PostgreSQL, 데이터 상태와 `drawFrame()` 미리보기를 확인할 수 있다.

> npm 12+ 는 설치 스크립트를 기본으로 막는다. 이 저장소는 꼭 필요한 패키지(prisma, @prisma/engines, @prisma/client, esbuild)만 `package.json` 의 `allowScripts` 에 허용해 두었다.

## 명령어

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | API + 웹 개발 서버 |
| `npm run typecheck` | 모든 워크스페이스 타입 검사 |
| `npm test` | 단위 테스트 (vitest) |
| `npm run build:web` | 웹 프로덕션 빌드 |
| `npm run db:migrate` | Prisma 마이그레이션 생성·적용 |
| `npm run db:studio` | DB 데이터 보기 |

## 로드맵

1. **기본 환경** — 모노레포, React, Express, PostgreSQL ← 지금
2. 회원 시스템 — 가입, 로그인, 세션 쿠키
3. 프로젝트 관리 — 생성, 저장, 불러오기
4. 음악 관리 — 업로드, 정렬, 구간 자르기
5. 편집기 — 배경, 텍스트, 미리보기
6. 렌더링 — BullMQ + FFmpeg Worker, MP4 다운로드
7. AWS 배포 — EC2, RDS, S3
