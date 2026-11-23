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

http://localhost:5173 에서 회원가입 후 대시보드를 쓸 수 있다. 개발 점검 화면(API·DB 상태, `drawFrame()` 미리보기)은 `/dev`.

## 인증

- 서버 세션 + `HttpOnly; SameSite=Lax` 쿠키 (`op_session`, 30일, 15일 이하 남으면 자동 연장). 프로덕션에서는 `Secure`.
- DB 에는 세션 토큰의 SHA-256 해시만 저장. 비밀번호는 argon2id.
- 데이터를 바꾸는 요청은 다른 사이트 `Origin` 이면 403 (CSRF 방어). 로그인·가입은 IP 당 15분 20회 제한.
- 다른 사용자의 프로젝트는 403 이 아니라 404 (존재 여부를 노출하지 않음).

| Method | Endpoint | 설명 |
| --- | --- | --- |
| POST | `/api/auth/register` | 가입 + 로그인 |
| POST | `/api/auth/login` | 로그인 |
| POST | `/api/auth/logout` | 로그아웃 |
| GET | `/api/auth/me` | 현재 사용자 |
| GET | `/api/projects` | 내 프로젝트 목록 |
| POST | `/api/projects` | 프로젝트 생성 |
| GET | `/api/projects/:id` | 프로젝트 상세 (내 것만) |
| PATCH | `/api/projects/:id` | 제목·설정 저장. `expectedUpdatedAt` 이 서버 값과 다르면 409 + 최신 상태 |
| DELETE | `/api/projects/:id` | 삭제 (원본 음원은 남음) |
| POST | `/api/projects/:id/duplicate` | 복제 (설정·곡 순서 포함) |

## 편집기 저장 방식

- 편집이 멈추고 0.8초 뒤 자동 저장. 저장 중에 또 고치면 끝난 뒤 다시 저장한다.
- 편집기를 떠나거나 탭을 닫으면 남은 변경을 `keepalive` 요청으로 보낸다. 저장 전이면 브라우저가 닫기 전에 확인을 묻는다.
- 다른 탭·기기에서 먼저 저장했으면 덮어쓰지 않고 "최신 내용 불러오기 / 내 변경으로 덮어쓰기"를 고르게 한다.

## 테스트

`npm test` 는 단위 테스트와 API 통합 테스트를 실행한다. API 테스트는 `DATABASE_URL` 의 DB 이름에 `_test` 를 붙인 별도 DB(`outpaly_test`)를 쓰며, 실행 전에 그 DB 를 비운다. 이름이 `_test` 로 끝나지 않으면 실행을 거부한다.

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

1. **기본 환경** — 모노레포, React, Express, PostgreSQL ✓
2. **회원 시스템** — 가입, 로그인, 세션 쿠키 ✓
3. **프로젝트 관리** — 생성, 저장, 불러오기, 복제, 삭제, 디자인 편집기 ✓
4. 음악 관리 — 업로드, 정렬, 구간 자르기
5. 편집기 — 배경, 텍스트, 미리보기
6. 렌더링 — BullMQ + FFmpeg Worker, MP4 다운로드
7. AWS 배포 — EC2, RDS, S3
