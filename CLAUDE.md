# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

DNGG (dn.gg) — 스포츠 경기 기록/랭킹 앱. 이 저장소에는 두 개의 앱과 루트의 배포 설정이 함께 있다:

- `frontend/` — Next.js 14 App Router + styled-components + Zustand + TanStack Query (개발 포트 **3011**, 운영 컨테이너 포트 **3000**)
- `backend/` — NestJS 11 + TypeORM + PostgreSQL 15 (포트 **3010**)
- 루트 — docker-compose 파일, PM2 설정(`ecosystem.config.cjs`), EC2 시작/중지 스크립트, Postgres 데이터 디렉토리(`pg-data/`, 절대 건드리지 말 것)

루트의 `PROJECT_CONTEXT.md`에 상세한 운영 이력(FK 제거, mixed-content 디버깅, 배포 주의사항)이 있다 — 배포나 Player/Log 데이터 모델을 수정하기 전에 반드시 읽을 것.

## 커밋 규칙

- 커밋 메시지의 설명(제목·본문)은 **한글로 작성**한다. conventional commit 타입 접두어(`feat:`, `fix:`, `docs:` 등)는 영문 그대로 사용한다. 예: `fix: 크론 갱신 재시도를 영속화된 실패 횟수 기반 멱등키로 변경`

## 명령어

패키지 매니저는 **pnpm**. 각 앱에 별도의 `package.json`이 있으므로 `frontend/` 또는 `backend/` 디렉토리 안에서 명령을 실행한다.

### 백엔드 (`backend/`)

```bash
pnpm dev                 # nest start --watch, NODE_ENV=dev (.env.dev 로드)
pnpm build               # NODE_ENV=prod nest build
pnpm lint                # eslint --fix
pnpm test                # jest (src/ 아래 모든 *.spec.ts)
pnpm test -- path/to/file.spec.ts   # 단일 테스트 파일 실행
pnpm test:e2e            # test/jest-e2e.json 설정으로 jest 실행
pnpm migration:run       # typeorm migration:run -d src/data-source.ts
```

### 프론트엔드 (`frontend/`)

```bash
pnpm dev                 # next dev -p 3011
pnpm build               # next build
pnpm lint                # next lint
```

### 로컬에서 전체 스택 실행

**최초 세팅 (한 번만)**

1. Docker 엔진 준비. Mac은 Docker Desktop 대안으로 Colima 권장:
   ```bash
   brew install colima docker docker-compose
   colima start                             # Linux VM + dockerd 부팅
   ```
2. 각 앱 의존성 설치. `bcrypt`·`@nestjs/core`·`@swc/core`·`unrs-resolver`의 postinstall은 `pnpm-workspace.yaml`의 `allowBuilds`로 자동 승인됨:
   ```bash
   cd backend && pnpm install
   cd ../frontend && pnpm install
   ```
3. 로컬 env 파일 준비:
   - `backend/.env.dev` — 팀 시크릿에서 받아서 배치 (`pnpm dev`가 `NODE_ENV=dev`로 로드)
   - `frontend/.env.dev`를 `frontend/.env.development`로 복사 (next dev가 자동 로드하는 이름)
   - 루트 `.env` — docker compose가 읽는 `DB_USERNAME/DB_PASSWORD/DB_DATABASE` 등
4. (선택) 운영 DB에서 로컬 Postgres로 스냅샷 복사. 로컬 컨테이너를 먼저 띄운 뒤 실행:
   ```bash
   ssh dngg 'docker exec -e PGPASSWORD=<PW> postgres pg_dump -U postgres -d dngg \
       --clean --if-exists --no-owner --no-privileges' \
   | docker exec -i -e PGPASSWORD=<PW> postgres psql -U postgres -d dngg
   ```

**매번 개발 시작할 때**

```bash
colima start                                    # Mac: docker 데몬 켜기 (재부팅 후만 필요)
docker compose up -d db                         # Postgres 컨테이너 (개발 시 가장 일반적)

# 방식 A — 터미널 2개로 실행 (권장, 로그 분리)
cd backend  && pnpm dev                         # :3010
cd frontend && pnpm dev                         # :3011

# 방식 B — 한 번에 백그라운드 실행
pm2 start ecosystem.config.cjs                  # backend + frontend watch 모드; pm2 logs로 로그 확인

# 방식 C — 전부 컨테이너로
docker compose -f docker-compose.dev.yml up
```

접속: 프론트 `http://localhost:3011`, API `http://localhost:3010`, DB `localhost:5432`.

운영 배포는 루트 `docker-compose.yaml` 기준(frontend :3000, backend :3010, db :5432)이며 이미지는 `onady/dngg-frontend` / `onady/dngg-backend`를 사용한다. `start-dngg.sh` / `stop-dngg.sh`는 EC2 인스턴스를 시작/중지한다.

## 환경 변수

- 백엔드는 `.env.${NODE_ENV}`를 로드한다 (`backend/`의 `.env.dev`, `.env.development`, `.env.prod`). 키: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `PORT`, `JWT_SECRET`, `MAIL_FROM`, `AWS_REGION`. `MAIL_FROM`이 없으면 인증 메일은 실발송 대신 콘솔 로그로 대체된다(dev 폴백) — 운영에는 반드시 설정할 것. SES 자격증명은 EC2 IAM Role을 사용한다.
- 프론트엔드는 `NEXT_PUBLIC_API_URL`을 사용하며 — **빌드 시점에 값이 박힌다**. 서버에서 `.env`만 바꾸고 프론트엔드 이미지를 재빌드하지 않으면 아무 효과가 없다; 브라우저는 계속 예전 API 주소로 호출한다.
- 허용 CORS origin은 `backend/src/main.ts`에 하드코딩되어 있다 (dngg.one, localhost:3011). 새 origin은 여기에 추가한다.

## 백엔드 아키텍처

표준 NestJS 계층 구조지만, 프로젝트 고유의 특이사항이 두 가지 있다:

- **모듈 구조**: `src/modules/<feature>/`에 `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.request.dto.ts`가 있다. 엔티티는 `src/entities/`에 중앙 집중되어 있고, 커스텀 리포지토리는 `src/repository/`에 있다(서비스에 주입). 도메인: `Group` → `User`/`Player`/`Game`/`Team`; `Game`은 `InGamePlayer` 참가자를 가지며, 득점 이벤트는 `Logitem`(이벤트 유형)을 참조하는 `Log` 행으로 기록된다.
- **의도적으로 제거된 FK**: `Log.player`와 `InGamePlayer.player`는 `createForeignKeyConstraints: false` + `nullable: true`를 사용해 Player 삭제 시에도 과거 경기/로그 데이터가 보존되도록 한다. 운영 DB에서 FK 제약을 의도적으로 제거한 상태이므로 — 다시 만들지 말 것. 그 결과 `player` relation이 `null`일 수 있다; 서비스(`game.service.ts`, `log.service.ts`)는 null player를 필터링/스킵하며, 이 relation을 다루는 새 코드도 반드시 null-safe여야 한다.
- **`synchronize: true`**가 `app.module.ts`에 설정되어 있어 TypeORM이 부팅 시 스키마를 자동 변경한다. 알려진 리스크다 (`src/migrations/`에 마이그레이션 파일이 있으며 장기적으로는 `synchronize: false`로 전환할 계획). 주의: 엔티티 변경은 백엔드 재시작 즉시 실제 DB에 반영된다.
- 전역 `ValidationPipe`가 `whitelist` + `forbidNonWhitelisted`로 동작한다 — request DTO에 선언되지 않은 프로퍼티는 거부되므로, 새 엔드포인트 필드는 반드시 DTO에 추가해야 한다.
- 전역 `HttpExceptionFilter`와 Winston 콘솔 로깅 사용 (`LoggerMiddleware`가 모든 라우트를 로깅).

## 프론트엔드 아키텍처

- App Router 페이지: `/` (경기 요약), `/games`, `/teams`, `/record/[id]` (실시간 기록), `/daily`, `/rankings`, `/player/[id]`, `/settings` (로그인/회원가입).
- **API 클라이언트**: `frontend/src/lib/axios.ts` (`@/lib/axios`)를 사용할 것 — `localStorage.token`의 JWT를 붙이고, 401을 처리한다(Authorization 헤더를 싣고 나간 요청의 401만 해당) — 로그아웃 후 토스트와 함께 `/settings`로 리다이렉트. `src/app/lib/axios.ts`는 아무 곳에서도 import하지 않는 레거시 중복 파일이다 — 여기에 import를 추가하지 말 것.
- **인증 상태**는 이원화되어 있다: Zustand persist 스토어(`src/app/stores/useAuthStore.ts`)와 axios 인터셉터가 읽는 raw `localStorage.token`. 로그인/로그아웃 플로우를 수정할 때 둘을 동기화 상태로 유지할 것.
- 그룹 선택은 `src/app/stores/groupStore.ts`에 있고, 서버 데이터는 TanStack Query로 관리한다.
- styled-components에 SSR registry(`src/app/registry.tsx`) 사용; 스타일 파일은 같은 위치의 `styles/*.ts` 모듈에 있다. hydration에 민감한 컴포넌트는 `useMounted` 훅을 사용한다.
- 토스트는 `src/lib/toastBus.ts`를 거친다 (`showGlobalToast`는 즉시 표시, `setPendingToast`는 페이지 이동 후에도 유지).

## 배포 — CI/CD 자동 배포 (⚠️ main 푸시 = 운영 배포)

**`main`에 푸시하면 `.github/workflows/deploy.yml`이 자동으로 운영에 배포한다.** 수동으로 이미지를 빌드/푸시하지 말 것 — CI가 amd64 네이티브로 빌드한다 (compose 파일 상단의 `npm run deploy` 수동 절차는 레거시).

동작 방식:
- 경로 필터: `backend/**` 변경 → backend 잡, `frontend/**` 변경 → frontend 잡, `docker-compose.yaml`·워크플로 변경 → deploy 잡만 실행. 각 잡은 Docker Hub에 `:latest`와 `:sha-<커밋>` 두 태그를 푸시한다.
- deploy 잡: 레포의 `docker-compose.yaml`을 서버(`/usr/local/project/dngg`)로 scp 동기화 → `docker compose pull frontend backend && up -d`. **서버의 compose 파일을 직접 수정해도 다음 배포에서 덮어써진다.**
- 수동 배포: Actions 탭의 workflow_dispatch 버튼 — 경로 필터와 무관하게 백엔드·프론트를 모두 빌드·배포한다 (동시 배포가 필요한 릴리스에 사용).
- 배포는 sha 태그 핀 방식: deploy 잡이 이번 런에서 빌드 성공한 서비스만 서버 `.env`의 `FRONTEND_VERSION`/`BACKEND_VERSION`을 `sha-<커밋>`으로 갱신한다 (빌드 스킵된 서비스는 직전 배포 sha 유지 — `:latest`는 배포 경로에서 사용하지 않음).
- 롤백: 서버 `.env`의 해당 `*_VERSION`을 이전 `sha-<커밋>`으로 바꾸고 `docker compose up -d <서비스>`. 단, 그 서비스가 재빌드되는 다음 CI 배포가 핀을 덮어쓰므로, 지속적 롤백은 문제 커밋을 revert해 새로 배포하는 방식으로 한다.

주의(2026-07-18 실제 장애 사례):
- **백엔드·프론트 잡은 독립적이다** — 한쪽이 실패해도 다른 쪽은 `:latest`를 푸시한다. 이후 compose만 바꾼 커밋이 deploy 잡만 실행하면 **신구 버전이 섞여 배포**될 수 있다 (실제로 신규 프론트+구형 백엔드 조합으로 가입 장애 발생). 프론트·백엔드가 함께 가야 하는 변경은 CI가 전부 green인지 확인하고, 필요하면 workflow_dispatch로 동시 배포할 것. (sha 핀 배포 전환 이후에는 deploy만 도는 커밋이 `:latest`를 집어오는 경로 자체가 제거됨)
- CI 헬스체크는 기존 라우트(`/group/all`, 프론트 루트)만 확인한다 — 배포가 success여도 신규 기능 라우트는 직접 스모크할 것.
- CI의 pnpm 버전은 로컬과 정확히 일치시켜 핀한다(현재 `11.13.1` — floating `11`은 금지). pnpm 9는 `packages` 없는 `pnpm-workspace.yaml`(allowBuilds 전용)을 못 읽어 install이 실패하고, pnpm 11.x는 `node:sqlite` 사용으로 **Node 22.13+가 필수**라 CI `setup-node`는 22다 (2026-07-18 배포 실패 원인 — PROJECT_CONTEXT.md 3.3 참고). 운영 컨테이너 Dockerfile은 아직 `node:20`이라 마이너 스큐가 있다.

## 배포 주의사항 (PROJECT_CONTEXT.md 참고)

- 사이트는 `https://dngg.one`에서 서비스된다; 해당 페이지에서 평문 `http://<ip>:3010`으로 백엔드를 호출하면 mixed content로 차단되어 서버 로그에도 남지 않는다. API 접근은 HTTPS 또는 same-origin 프록시로 유지할 것.
- `docker compose down -v`는 Postgres 볼륨을 삭제한다 — 여기서는 절대 `-v`를 쓰지 말 것.
