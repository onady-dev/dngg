# DNGG Project Context

이 문서는 이후 세션에서 이 프로젝트를 빠르게 이어받기 위한 운영 메모다.

## 1. 프로젝트 개요

- 루트 경로: `E:\project\dngg`
- 배포 기준 compose 파일: [`docker-compose.yaml`](</E:/project/dngg/docker-compose.yaml>)
- 스택:
  - `frontend`: Next.js 14 App Router + styled-components + Zustand
  - `backend`: NestJS 11 + TypeORM + PostgreSQL
  - `db`: Postgres 15

서비스 역할:
- 프론트는 경기 기록/랭킹/선수/팀 관리 UI
- 백엔드는 그룹, 유저, 선수, 경기, 로그 API
- DB는 `group`, `user`, `player`, `game`, `in_game_player`, `log`, `logitem` 중심

주요 화면:
- `/`: 경기 요약
- `/games`: 경기 생성/종료/삭제
- `/teams`: 선수 추가, 팀 조합 관리
- `/record/[id]`: 실시간 경기 기록
- `/daily`: 일자별 집계
- `/rankings`: 누적/평균 랭킹
- `/settings`: 로그인/회원가입

## 2. 배포 구조

루트 compose 기준:
- `frontend` 외부 포트 `3000`
- `backend` 외부 포트 `3010`
- `db` 외부 포트 `5432`

현재 compose는 아래를 마운트한다:
- `./postgresql.conf:/etc/postgresql.conf`
- `./pg-data:/var/lib/postgresql/data`

현재 워크스페이스에는 `pg-data`와 `postgresql.conf`가 존재한다.

루트 `.env` 예시 항목:
- `FRONTEND_VERSION`
- `BACKEND_VERSION`
- `DB_USERNAME`
- `DB_PASSWORD`
- `DB_DATABASE`
- `DB_HOST`
- `DB_PORT`
- `PORT`
- `NEXT_PUBLIC_API_URL`
- `JWT_SECRET`

중요:
- 프론트의 `NEXT_PUBLIC_API_URL`은 Next.js 빌드 시점 값이다.
- 서버에서 `.env`만 바꾸고 프론트를 재빌드하지 않으면 브라우저는 예전 API 주소로 계속 호출할 수 있다.

## 3. 최근 확인한 이슈

### 3.1 Player FK 제거 이슈

원래 `playerId`가 아래 FK로 연결돼 있었음:
- `public.in_game_player` -> `player.id`
- `public.log` -> `player.id`

서버에서 player 삭제가 잘 안 돼서 DB에서 아래 제약을 제거한 상태를 전제로 작업함:

```sql
ALTER TABLE public.in_game_player DROP CONSTRAINT IF EXISTS "FK_9dc222846324b6ab4509e0841bf";
ALTER TABLE public.log DROP CONSTRAINT IF EXISTS "FK_b24c53a509d580f8d819da8d01d";
```

제약 제거 이후 `player` relation이 `null`이 될 수 있어 아래 오류가 발생했음:

```text
TypeError: Cannot read properties of null (reading 'name')
```

### 3.2 외부 API 요청이 서버 로그에 안 찍히는 이슈

브라우저 주소창에서 `http://<EC2-IP>:3010/group/all`은 응답이 오는데, `dngg.one`에서 보내는 요청은 서버 로그에 안 찍히는 현상이 있었음.

가장 유력한 원인:
- `https://dngg.one` 페이지에서 `http://<IP>:3010`으로 요청하는 mixed content

이 경우:
- 브라우저가 요청 자체를 막음
- 백엔드 로그에는 요청이 안 보임
- 주소창 직접 접근은 정상

확인 포인트:
- 브라우저 devtools console의 `Mixed Content`
- network 탭의 `blocked:mixed-content`
- 배포된 프론트 번들에 박힌 `NEXT_PUBLIC_API_URL`

권장 방향:
- API도 HTTPS로 노출하거나
- 같은 도메인에서 reverse proxy로 `/api` 붙여서 사용

### 3.3 CI 배포 실패 — pnpm 11.x의 Node 22.13+ 요구 (2026-07-18)

main 푸시 후 Deploy 워크플로의 backend 잡이 `actions/setup-node@v4` 단계에서 실패:

```text
Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite
warn: This version of pnpm requires at least Node.js v22.13
```

원인:
- `pnpm/action-setup@v4`의 `version: 11`이 최신 11.x(당시 11.14.0)를 floating 설치
- pnpm 11.x는 스토어 인덱스에 `node:sqlite` 내장 모듈(Node 22.13+)을 사용
- CI 러너는 `node-version: 20`이었고, `setup-node`의 `cache: pnpm`이 캐시 경로 확인을 위해 `pnpm store path`를 실행하는 순간 크래시
- pnpm을 11.13.1로 핀해도 동일하게 실패 — **pnpm 11.x 전체가 Node 22.13+ 필수** (로컬은 Node 24라 재현 안 됨)

해결 (커밋 `9a742fd`, `dbcd7b7`):
- pnpm은 로컬 개발 버전과 동일한 `11.13.1`로 정확히 핀 (floating 방지)
- CI `setup-node`를 `node-version: 22`로 상향

당시 운영 영향: 없음 — backend 잡 실패로 deploy 잡이 스킵되어 서버는 이전 버전 유지 (sha 핀 배포 방식이라 frontend `:latest` 푸시도 무해).

남은 스큐: 운영 컨테이너 Dockerfile 2개(backend/frontend)는 아직 `node:20`이라 CI 테스트 런타임(22)과 마이너 버전이 어긋남 — 9장 후속 작업 참고.

## 4. 최근 코드 수정 사항

### 4.1 FK 재생성 방지

아래 엔티티에서 `Player` relation이 FK를 다시 만들지 않도록 수정함:

- [`backend/src/entities/Log.entity.ts`](</E:/project/dngg/backend/src/entities/Log.entity.ts>)
- [`backend/src/entities/InGamePlayer.entity.ts`](</E:/project/dngg/backend/src/entities/InGamePlayer.entity.ts>)

핵심 변경:
- `nullable: true`
- `createForeignKeyConstraints: false`
- `@JoinColumn({ name: 'playerId', referencedColumnName: 'id' })`

의도:
- `playerId` 컬럼은 유지
- relation 조회는 가능
- DB FK는 생성하지 않음
- 삭제된 player를 참조하는 과거 경기 로그/참가 데이터도 보존

### 4.2 null-safe 처리

아래 파일에서 삭제된 player 때문에 `null` relation이 와도 안전하게 동작하도록 수정함:

- [`backend/src/modules/game/game.service.ts`](</E:/project/dngg/backend/src/modules/game/game.service.ts>)
- [`backend/src/modules/log/log.service.ts`](</E:/project/dngg/backend/src/modules/log/log.service.ts>)

수정 내용:
- 경기 조회 시 `inGamePlayer.player`가 없는 항목은 응답에서 제외
- 일별 로그 집계 시 `log.player`가 없으면 집계에서 건너뜀
- TypeScript null 에러를 피하기 위해 `flatMap` 기반으로 좁힘

영향:
- 과거 로그는 남지만, 삭제된 선수는 경기 응답의 `homePlayers`/`awayPlayers` 배열에서 빠질 수 있음
- `log` 자체는 남아 있으므로 점수 합산이나 로그 이력에서 `playerId` 기준 처리가 필요할 수 있음

## 5. 코드상 주의할 점

### 5.1 TypeORM synchronize

[`backend/src/app.module.ts`](</E:/project/dngg/backend/src/app.module.ts>)는 현재:

- `synchronize: true`

이 설정은 운영에서 위험하다.
- 스키마가 코드에 따라 자동 변경될 수 있음
- FK/인덱스/컬럼 상태가 의도치 않게 변할 수 있음

이번 수정으로 `Player` FK 재생성 가능성은 낮췄지만, 장기적으로는:
- `synchronize: false`
- migration 기반 운영
으로 바꾸는 것이 맞다.

### 5.2 Dockerfile/환경값 불일치 이력

이전 점검 시 아래와 같은 설정 불일치를 확인했음:
- backend Dockerfile의 `EXPOSE`가 실제 서비스 포트와 다를 수 있었음
- axios fallback 주소가 `localhost:4000`인 코드가 있었음
- 실제 백엔드 포트는 `3010`

관련 파일:
- [`frontend/src/lib/axios.ts`](</E:/project/dngg/frontend/src/lib/axios.ts>)
- [`backend/Dockerfile`](</E:/project/dngg/backend/Dockerfile>)

재배포 전 실제 값 확인 필요.

### 5.3 인증 저장 방식

프론트는 Zustand persist를 쓰고 있지만 axios interceptor는 `localStorage.token`을 보는 코드가 있었음.

관련 파일:
- [`frontend/src/app/stores/useAuthStore.ts`](</E:/project/dngg/frontend/src/app/stores/useAuthStore.ts>)
- [`frontend/src/lib/axios.ts`](</E:/project/dngg/frontend/src/lib/axios.ts>)

토큰 저장 방식이 일관되지 않을 수 있으니 로그인/401 처리 확인 필요.

### 5.4 [임시] 회원가입 이메일 인증 우회 (2026-07-20, SES 승인 대기)

AWS SES 프로덕션 승인 지연으로 인증 코드 메일이 발송되지 않아, **회원가입 이메일 인증을 임시로 우회**했다. SES 승인되면 아래를 모두 복구할 것.

배경:
- 운영에서 SES 미승인 상태면 `mailService.sendVerificationCode`가 실패 → `requestCode`가 방금 저장한 인증 행을 지우고 에러 반환 → 사용자는 인증 코드를 받을 수 없어 가입 자체가 막힘.
- 그래서 인증 단계를 건너뛰고 `email`/`password`/`name`/`groupName`만으로 가입되도록 변경.

변경 파일 (모두 코드에 `[임시]` 마커 주석 있음):
- `backend/src/modules/user/user.service.ts` — `createUser`의 `assertVerified`·email 일치 검사·`markConsumed` 호출을 주석 처리
- `backend/src/modules/user/user.request.dto.ts` — `CreateUserDto.verificationToken`을 `@IsNotEmpty @IsString`(필수) → `@IsOptional @IsString`(선택)으로 완화
- `backend/src/modules/user/user-signup.spec.ts` — "인증 강제" describe 3개를 블록 주석 처리(복구용 원문 보존), "토큰 없이도 가입" 우회 테스트 추가
- `frontend/src/app/components/Signup.tsx` — `EmailCodeVerification` 게이트 제거, 이메일 직접 입력 필드 추가, `POST /user` 본문에서 `verificationToken` 제거

복구 방법 (SES 승인 후):
1. 위 4개 파일의 `[임시]` 주석을 원복한다 (이 커밋을 `git revert`하거나 git 이력으로 원본 확인).
2. `user-signup.spec.ts`의 "인증 강제" describe 블록 주석 해제 + "우회" 테스트 제거.
3. `backend`에서 `pnpm test` green 확인 후 배포.

주의:
- 우회 동안에는 **누구나 임의 이메일로 계정+그룹 생성 가능**(이메일 소유 증명 없음). 중복 이메일은 DB 유니크 제약(→ 400 `Email already exists`)으로만 차단된다.
- **비밀번호 재설정(`resetPassword`)도 SES 발송에 의존**하므로 미승인 동안 동작하지 않는다. 이번 우회 범위에는 포함하지 않았다.

## 6. 운영 명령 메모

### 6.1 로컬 DB만 올리기

```powershell
cd E:\project\dngg
docker compose up -d db
docker compose ps
docker compose logs -f db
```

### 6.2 서버에서 DB 재시작

```bash
cd /path/to/dngg
docker compose restart db
```

또는:

```bash
docker compose stop db
docker compose up -d db
```

주의:
- `down -v`는 데이터 볼륨 삭제 위험

### 6.3 FK 존재 여부 확인

```bash
docker exec -it postgres psql -U postgres -d dngg
```

```sql
\d public.log
\d public.in_game_player
```

### 6.4 FK 제거 SQL

```sql
ALTER TABLE public.in_game_player DROP CONSTRAINT IF EXISTS "FK_9dc222846324b6ab4509e0841bf";
ALTER TABLE public.log DROP CONSTRAINT IF EXISTS "FK_b24c53a509d580f8d819da8d01d";
```

## 7. 배포/네트워크 점검 메모

외부에서 API가 안 될 때 우선순위:

1. 서버 내부 확인

```bash
curl http://127.0.0.1:3010/group/all
ss -lntp | grep 3010
docker compose ps
docker compose logs -f backend
```

2. 외부 확인

```bash
curl http://<PUBLIC-IP>:3010/group/all
```

3. 내부는 되는데 외부만 안 되면:
- EC2 Security Group
- 서버 방화벽
- ALB 구조 여부

4. 주소창 직접 접근은 되는데 사이트에서만 안 되면:
- mixed content
- CORS
- 프론트 빌드 시 API URL 불일치

## 8. 다음 세션에서 먼저 볼 파일

우선순위 높은 파일:
- [`docker-compose.yaml`](</E:/project/dngg/docker-compose.yaml>)
- [`backend/src/app.module.ts`](</E:/project/dngg/backend/src/app.module.ts>)
- [`backend/src/entities/Log.entity.ts`](</E:/project/dngg/backend/src/entities/Log.entity.ts>)
- [`backend/src/entities/InGamePlayer.entity.ts`](</E:/project/dngg/backend/src/entities/InGamePlayer.entity.ts>)
- [`backend/src/modules/game/game.service.ts`](</E:/project/dngg/backend/src/modules/game/game.service.ts>)
- [`backend/src/modules/log/log.service.ts`](</E:/project/dngg/backend/src/modules/log/log.service.ts>)
- [`frontend/src/lib/axios.ts`](</E:/project/dngg/frontend/src/lib/axios.ts>)
- [`frontend/src/app/stores/useAuthStore.ts`](</E:/project/dngg/frontend/src/app/stores/useAuthStore.ts>)

## 9. 권장 후속 작업

- `synchronize: true` 제거 및 migration 체계 정리
- player 삭제 정책 명확화
  - soft delete로 갈지
  - 과거 로그 보존 방식 유지할지
- 프론트 API 호출을 HTTPS 또는 same-origin proxy로 정리
- 인증 토큰 저장 로직 일원화
- 운영 문서와 실제 배포 스크립트 경로 정리
- backend/frontend Dockerfile의 `node:20`을 `node:22`로 상향해 CI 테스트 런타임(Node 22)과 정렬 (3.3 참고)
- **[임시] SES 승인 후 회원가입 이메일 인증 복구** (5.4 참고) — 우회 동안 이메일 소유 증명 없이 가입 가능하므로 승인 즉시 되돌릴 것
