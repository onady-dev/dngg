# 관리자 페이지 + 유료화 서비스 시작 — 설계

날짜: 2026-07-15
상태: 사용자 승인 완료 (브레인스토밍 세션)
선행 기능: 구독 결제 (feature/subscription, `docs/superpowers/specs/2026-07-13-subscription-design.md`)

## 목적

1. 운영자(관리자)가 **"유료화 서비스 시작" 버튼**으로 무료 게이팅을 전 그룹에 일괄 발동한다.
   - 시작 **전**: 모든 그룹이 게임을 무제한 무료 생성 (게이팅/카운터 완전 비활성).
   - 시작 **시점**: 각 그룹이 지금까지 만든 게임 수가 무료 한도(10)에 포함된다 — 이미 10개 이상 만든 그룹은 기존 게임은 유지하되, 추가 생성은 구독 필요. 10개 미만 그룹은 잔여분만 무료 생성 가능.
   - 시작 후: 기존 구독 게이팅 로직이 그대로 동작.
   - **단방향**: 한 번 시작하면 UI/API로 되돌릴 수 없다 (비상시 DB 수동 처리).
2. 관리자 전용 `/admin` 페이지: 유료화 버튼 + 그룹 현황 + 구독/결제 현황.
3. 관리자는 **모든 그룹의 데이터 입력 가능** — 기존 teams/games/record 페이지를 그룹 전환으로 그대로 사용.

## 확정된 접근 (A-1 + B-2)

- **A-1 (유료화 정산)**: 버튼 클릭 시 한 번만 backfill — 각 그룹의 `freeGamesUsed`를 실제 게임 수로 스냅샷. backfill 기준은 **클릭 시점에 존재하는 게임 행 수**다 (과거에 만들었다 삭제한 게임은 세지 않음; 시작 이후부터는 기존 규칙대로 삭제해도 카운트가 줄지 않음). 이후 기존 원자 증가 게이팅이 무변경으로 동작. 실시간 COUNT 방식(A-2)은 삭제-재생성 우회가 열려 기각.
- **선행 설계 대체**: 구독 설계 문서의 "전 그룹이 freeGamesUsed 0에서 시작하므로 기존 그룹 +10 보너스" 서술은 본 설계의 backfill 방식으로 **대체**된다 — 유료화 시작 시점의 기존 게임 수가 한도에 포함된다.
- **B-2 (교차그룹 접근)**: 그룹 전환 = 스코프 토큰 재발급. `POST /admin/switch-group/:groupId`가 대상 groupId를 담은 JWT(role=admin 유지)를 발급하고 프론트가 토큰을 교체 — 기존 백엔드의 단일 groupId 신뢰 모델과 `assertSameGroup` 검증을 하나도 수정하지 않는다. 모든 검증 지점에 admin 예외를 심는 방식(B-1)은 침습적·누락 위험으로 기각.

## 데이터 모델

- `User.role`: `varchar`, 기본값 `'user'` (`'user' | 'admin'`). 최초 관리자는 DB 수동 지정: `UPDATE "user" SET role='admin' WHERE email='...'`. `synchronize: true`라 컬럼은 백엔드 재시작 시 자동 추가된다 (기존 행은 default로 채워짐 — 무해).
- `AppSetting` 엔티티 신설: `key`(varchar, PK), `value`(varchar). 유료화 시작은 `key='monetizationStartedAt'`, `value=ISO 시각` 행의 존재로 판정한다. 삭제/수정 API는 만들지 않는다 (단방향).
- Group, Subscription, Payment 등 기존 엔티티 변경 없음.

## 인증

- 로그인 시 JWT payload에 `role`을 포함한다. **기존 발급 토큰에는 role이 없으므로 `'user'`로 취급** — 관리자 지정 후 재로그인 필요 (무해, 별도 마이그레이션 불요).
- `AdminGuard`: JWT 검증 후 `req.user.role === 'admin'`이 아니면 403. 모든 admin API에 적용.

## 백엔드 — admin 모듈 (`backend/src/modules/admin/`)

모든 엔드포인트는 JWT 가드 + AdminGuard.

| 메서드 | 경로 | 동작 |
|---|---|---|
| POST | `/admin/monetization/start` | 이미 시작됐으면 **409**. 트랜잭션 안에서: (1) 전 그룹 `freeGamesUsed = GREATEST(현재값, 그 그룹의 실제 게임 수)` 일괄 backfill (GREATEST로 기존 값을 절대 줄이지 않음), (2) AppSetting에 시작 시각 기록 |
| GET | `/admin/monetization` | 시작 여부/시각 (버튼 상태 표시용) |
| GET | `/admin/groups` | 그룹 목록: 이름, 게임 수, `freeGamesUsed`, 구독 상태 |
| GET | `/admin/subscriptions` | 구독 상태별 집계 + 최근 결제 내역 (기존 subscription 리포지토리 재사용, `billingKey`는 어떤 응답에도 포함 금지 — 기존 원칙 유지) |
| POST | `/admin/switch-group/:groupId` | 대상 그룹 존재(및 미삭제) 확인 → `{ 관리자 userId, groupId: 대상, role: 'admin' }` JWT 발급. 만료 정책은 일반 로그인과 동일 |

## 게이팅 변경 (`game.service.ts` `saveGameAndLogs`)

기존 게이팅 블록(신규 생성 시에만 적용, 원자 증가 + 한도 재확인 + 402) **앞단에 두 가지 skip 조건만 추가**한다:

1. 유료화 미시작 (AppSetting에 `monetizationStartedAt` 없음) → 게이팅·카운터 전체 skip (무제한, 카운트하지 않음).
2. `req.user.role === 'admin'` → skip (관리자 우회, 카운터 미증가). 유료화 시작 여부와 무관.
3. 그 외 → 기존 로직 그대로.

AppSetting 조회는 생성 요청마다 1회 DB 조회로 충분하다 (게임 생성 빈도 낮음, 캐시 불요 — KISS).

`GET /subscription/status` 응답에 `monetizationStarted: boolean`을 추가한다 (프론트 배지 제어용).

## 프론트엔드

### `/admin` 페이지 (신설)

- 진입: 설정 페이지에 "관리자" 메뉴 — role이 admin일 때만 노출. 비관리자가 URL 직접 접근 시 홈으로 리다이렉트 (서버 API 403이 실질 방어선, 프론트는 UX용 이중 방어).
- 한 페이지, 세 섹션:
  1. **유료화 카드** — 상태 표시(시작 전 / 시작 시각). 시작 전이면 "유료화 서비스 시작" 버튼 + 확인 다이얼로그("전체 그룹에 즉시 적용되며 되돌릴 수 없습니다" + 명시적 확인) → 성공 시 상태 갱신.
  2. **그룹 현황 테이블** — 이름 / 게임 수 / 무료 사용량 / 구독 상태 + 행별 "이 그룹으로 전환" 버튼.
  3. **구독·결제 현황** — 상태별 구독 수 집계 + 최근 결제 목록(성공/실패, 금액, 일시).

### role 전파 + 그룹 전환

- role은 로그인 응답과 JWT payload에서 확보해 `useAuthStore`에 저장.
- 관리자로 로그인하면 공통 레이아웃 상단에 **그룹 셀렉터** 노출 (일반 유저에게는 렌더링하지 않음).
- 전환 시: `POST /admin/switch-group/:id` → 응답 토큰을 `localStorage.token`과 `useAuthStore` **둘 다 동기 갱신** (기존 인증 이원화 구조 유지) → TanStack Query 캐시 전체 invalidate + `groupStore` 갱신 → 현재 페이지가 새 그룹 데이터로 리로드.
- 전환 후 기존 teams/games/record 페이지는 코드 수정 없이 해당 그룹 관점으로 동작. 토큰에 role=admin이 유지되므로 게임 생성 게이팅도 자동 우회.

### 잔여 무료 배지 연동

- `monetizationStarted=false` → 배지 숨김 (무제한 상태).
- 시작 후 → 기존 배지 동작 그대로.

## 에러 처리

- 유료화 시작 중복 클릭 → 409 수신 시 "이미 시작됨" 토스트 + 상태 갱신.
- switch-group 대상 그룹 없음/삭제됨 → 404 토스트.
- 관리자 API 403 → 기존 axios 인터셉터 규칙 유지 (401만 로그아웃 처리, 403은 페이지에서 안내).

## 테스트 (jest, `*.spec.ts`)

- 유료화 시작 전: 게이팅 skip (구독 없이도 통과, 카운터 미증가).
- 유료화 시작 후: 기존 402 게이팅 동작 유지.
- backfill: 게임 수 반영 + GREATEST로 기존 값 미감소.
- `POST /admin/monetization/start` 중복 호출 409 / 비관리자 403.
- switch-group: 발급 토큰에 대상 groupId + role=admin 포함, 없는 그룹 404.
- 관리자 게임 생성: 게이팅 우회 + 카운터 미증가.
- 프론트: 빌드 통과 + 수동 확인 (기존 관례).

## 배포 주의

- `User.role`, `AppSetting`은 synchronize로 자동 반영 — 파괴적 변경 없음.
- 이 기능은 feature/subscription 위에 쌓인다 — 배포 시 구독 기능의 기존 운영 게이트(subscription/payment 테이블 empty 확인, 토스 키 env)가 그대로 선행 조건.
- 유료화 시작 전까지는 게이팅이 완전 비활성이므로, **구독 기능을 먼저 배포해두고 준비되면 버튼으로 발동**하는 운영 순서가 성립한다.

## 스코프 제외 (명시)

- 관리자 행위 감사 로그
- 관리자 계정 관리 UI (승격은 DB 수동)
- 유료화 되돌리기 / 그룹별 개별 유료화
- 즉시 환불 등 결제 조작 기능
