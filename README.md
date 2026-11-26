# OutPaly — Playlist Video Studio

**Create. Mix. Play.** 음악 파일과 배경 이미지로 유튜브용 플레이리스트 영상(MP4)을 만드는 웹 서비스.

## 구조

```
apps/
  web/          React + Vite + Tailwind  (편집기 화면)
  api/          Express + Prisma         (인증, 프로젝트, 업로드, 렌더 요청)
  worker/       렌더링 Worker              (PostgreSQL 대기열 → Canvas 프레임 + FFmpeg → MP4)
packages/
  shared/       ProjectDoc 스키마(zod), API 타입
  editor-core/  곡 시작 시각·전체 길이·타임스탬프 계산
  render-core/  drawFrame() — 브라우저 미리보기와 서버 렌더가 같이 쓰는 프레임 그리기
  storage/      파일 저장소 (API·Worker 공용, 지금은 로컬 디스크)
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

npm run dev                   # API :4000 + 웹 http://localhost:5173 + 렌더링 Worker
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
| PATCH | `/api/projects/:id` | 제목·설정 저장. `expectedRevision` 이 서버 값과 다르면 409 + 최신 상태 |
| DELETE | `/api/projects/:id` | 삭제 (원본 음원은 남음) |
| POST | `/api/projects/:id/duplicate` | 복제 (설정·곡 순서 포함) |

## 음악

업로드는 S3 presigned URL 과 같은 3단계라서, 배포 때 저장소만 S3 로 바꾸면 프론트엔드는 그대로다.

1. `POST /api/tracks/upload-url` — 형식(MP3·WAV)·크기(100MB) 확인 후 15분짜리 업로드 주소 발급
2. 브라우저가 그 주소로 파일을 `PUT` (로컬에서는 HMAC 서명 토큰이 붙은 `/api/storage/upload/:token`, 파일은 `.storage/`)
3. `POST /api/tracks/complete` — 서버가 파일 내용을 직접 읽어 실제 형식·길이·태그 확인. 가짜 파일은 지운다

| Method | Endpoint | 설명 |
| --- | --- | --- |
| GET | `/api/tracks` | 내 음악 |
| GET | `/api/tracks/:id/stream` | 재생 (Range 지원) |
| DELETE | `/api/tracks/:id` | 삭제 (프로젝트에서 쓰는 중이면 409) |
| POST | `/api/projects/:id/tracks` | 곡 추가 (끝에 붙임, 최대 50곡) |
| PATCH | `/api/projects/:id/tracks/reorder` | 순서 변경 (전체 순서, 목록이 바뀌었으면 409) |
| PATCH | `/api/projects/:id/tracks/:ptId` | 표시 제목·아티스트, 구간, 볼륨, 곡 뒤 무음 |
| DELETE | `/api/projects/:id/tracks/:ptId` | 프로젝트에서 빼기 (원본은 내 음악에 남음) |

곡 편집은 `updatedAt` 만 바꾸고 `revision` 은 그대로라서, 곡을 추가·정렬해도 디자인 자동 저장과 충돌하지 않는다.

## 배경 이미지

음악과 같은 3단계 업로드 (`/api/assets/upload-url` → PUT → `/api/assets/complete`). JPG·PNG·WebP, 20MB, 가로·세로 16~8000px.

완료 단계에서 서버가 이미지를 열어 **다시 저장**한다:

- 휴대폰 사진의 회전 정보(EXIF orientation)를 픽셀에 반영 → 브라우저 미리보기와 서버 렌더가 같은 방향
- 촬영 위치(GPS) 등 메타데이터 제거
- 실제로 열리는 이미지인지 확인 (확장자·Content-Type 은 믿지 않음)

설정 저장 때 배경 이미지가 **내 것인지** 확인한다 (남의 이미지 id 로 그 사람 사진을 영상에 넣지 못하게). 배경으로 쓰는 중이거나 렌더가 쓰는 중인 이미지는 지울 수 없다.

| Method | Endpoint | 설명 |
| --- | --- | --- |
| GET | `/api/assets` | 내 이미지 |
| GET | `/api/assets/:id/file` | 이미지 파일 |
| DELETE | `/api/assets/:id` | 삭제 (사용 중이면 409) |

배경 설정: 화면 채우기/전체 보이기, 확대(1~3배), 가로·세로 위치, 여백 색, 어둡게. 글자 그림자는 제목·트랙리스트 각각 켜고 끈다. 새 칸은 기본값이 있어 예전 프로젝트도 그대로 열리고 모양이 바뀌지 않는다.

## 편집기 배치 · 글꼴

- **직접 배치**: 미리보기 위에서 제목·트랙리스트를 끌어 옮기고, 트랙리스트 오른쪽 끝을 끌어 너비를 바꾼다. 화면 가운데·5% 여백에 맞춤선이 붙는다 (Alt 를 누르면 자유롭게). 손잡이에 포커스한 뒤 화살표 키(Shift 와 함께 크게)로도 옮긴다.
- **제목**: 정렬(왼쪽·가운데·오른쪽 — `position` 이 그 기준점), 부제 크기.
- **트랙리스트**: 기본 배치(왼쪽·오른쪽·아래) 또는 직접 배치(`box`), 열 개수(자동·1~3), 줄 간격, 정렬.
- **글꼴 12종** (`packages/shared/src/fonts.ts`): 모두 Google Fonts 의 OFL 글꼴. 브라우저는 Google Fonts, 렌더 서버는 같은 TTF(`@expo-google-fonts/*`). 굵은 파일이 없는 글꼴은 "굵게"도 보통 굵기로 그린다 — 브라우저의 가짜 굵게와 서버 결과가 달라지지 않게.
- 브라우저는 쓰는 글꼴만, **실제로 그릴 글자가 든 글자 묶음**까지 받은 뒤 그린다. (Google Fonts 는 한글을 글자 묶음으로 쪼개 두어서, 견본 글자만 받으면 나머지 글자가 기본 글꼴로 그려진다.)
- 넓은 화면에서는 편집기가 창 높이에 맞고 양쪽 패널만 스크롤한다. 미리보기 묶음(미리보기·안내·재생 막대)은 남은 공간의 가로·세로 중 작은 쪽에 맞춘다.

## 렌더링

| Method | Endpoint | 설명 |
| --- | --- | --- |
| POST | `/api/renders` | 렌더 요청. 그 순간의 프로젝트를 스냅샷으로 저장. 같은 프로젝트가 진행 중이면 409 + 그 작업 |
| GET | `/api/renders/:id` | 상태(QUEUED → PREPARING → PROCESSING → UPLOADING → COMPLETED / FAILED / CANCELLED)·진행률 |
| POST | `/api/renders/:id/cancel` | 취소. 대기 중이면 바로, 처리 중이면 Worker 가 FFmpeg 를 멈춘다 |
| GET | `/api/renders/:id/download` | 완성 MP4 (`프로젝트 이름.mp4`) |
| GET | `/api/projects/:id/renders` | 프로젝트의 최근 렌더 10개 |

**대기열은 Redis 가 아니라 PostgreSQL**(`render_jobs`)이다. Worker 는 `FOR UPDATE SKIP LOCKED` 로 작업을 하나씩 가져가므로 여러 대를 띄워도 된다. 처리 중에는 5초마다 heartbeat 를 남기고, 60초 동안 없으면 다른 Worker 가 다시 대기열로 돌린다 (최대 3번 시도 후 FAILED).

**파이프라인** (`apps/worker/src/render/pipeline.ts`)

1. 곡마다 `drawFrame()` 으로 PNG 한 장 (Noto Sans/Serif KR 고정 굵기 TTF — 가변 폰트는 굵기가 틀리게 나와서 쓰지 않음)
2. 오디오(곡별 구간·볼륨·무음, 계산한 길이에 정확히 맞춤)와 영상(x264 stillimage)을 **동시에** 인코딩
3. `-c copy` 로 합치고 `+faststart`

측정값 (Ryzen 5 7600): 1분 영상 2.7초. 1시간 영상은 실험(spikes, 오디오·영상 순차 인코딩)에서 약 3.5분이었고, 동시 인코딩을 적용한 뒤 1시간 분량은 아직 다시 재지 않았다.

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
4. **음악 관리** — 업로드, 정렬, 구간 자르기, 미리듣기 ✓
5. **편집기** — 배경 이미지(위치·확대), 기본 배경, 글자 그림자 ✓ · 화면 비율(9:16, 1:1)은 배치를 따로 설계한 뒤
6. **렌더링** — PostgreSQL 대기열 + FFmpeg Worker, MP4 다운로드 ✓
7. AWS 배포 — EC2, RDS, S3
