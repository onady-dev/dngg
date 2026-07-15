# DNGG 월 구독 결제 기능 설계

- 작성일: 2026-07-13
- 상태: 승인됨 (사용자 확인 완료)
- 브랜치: `feature/subscription` (완성 후 main 병합 → 배포)

## 목표

그룹(팀) 단위 월/연 구독 결제를 도입한다. 무료 그룹은 경기 생성 10회까지 가능하고, 구독한 그룹은 무제한 생성할 수 있다. 기록 조회는 항상 무료다.

## 요구사항 요약

| 항목 | 결정 |
|------|------|
| 구독 주체 | 그룹(팀) 단위 — 그룹의 User 계정이 결제 |
| 무료 한도 | 경기 생성 10회 (조회는 항상 무료) |
| 기존 그룹 처리 | 시행일 기준 +10회 보너스 (카운터가 0에서 시작하므로 자동 충족) |
| PG | 토스페이먼츠 빌링 (빌링키 자동결제) |
| 플랜 | 단일 플랜, 월/연 주기 선택 |
| 가격 | 서버 설정값 (기본: 월 9,900원 / 연 99,000원) |
| 갱신 | 서버 크론 자동갱신, 실패 시 3일 유예 후 만료 |
| 게이팅 | `Group.freeGamesUsed` 카운터 (삭제-재생성 우회 방지) |

## 데이터 모델

기존 `Subscription`/`Payment` 엔티티 뼈대는 User 기준이며 사용하는 코드가 없으므로 Group 기준으로 개편한다.

### Subscription (그룹당 최대 1개의 유효 구독)

- `group`: ManyToOne → Group
- `billingCycle`: `'monthly' | 'yearly'`
- `status`: `'active' | 'past_due' | 'canceled' | 'expired'`
  - `active`: 정상 구독 중
  - `past_due`: 갱신 결제 실패, 유예 기간 (프리미엄 유지, 매일 재시도)
  - `canceled`: 해지 예약 후 기간 만료됨
  - `expired`: 유예 기간 내 결제 실패로 만료됨
- `currentPeriodStart` / `currentPeriodEnd`: timestamp
- `cancelAtPeriodEnd`: boolean (해지 예약)
- `billingKey`: 토스 발급값 — **어떤 API 응답에도 포함 금지**

그룹당 유효 구독(`active`/`past_due`)은 최대 1개 — `POST /subscription/billing-key`는 이미 유효 구독이 있으면 **409 Conflict**로 거부한다 (중복/동시 호출로 인한 이중 결제 방지).

유예 기간 판정은 별도 필드 없이 `currentPeriodEnd + 3일`로 계산한다 (크론이 `past_due` 구독 중 이 시점을 지난 것을 `expired` 처리).

### Payment (결제 이력)

- `subscription`, `group`, `user` 참조
- `amount`: int, `orderId`: varchar unique (멱등성), `externalPaymentId`: 토스 paymentKey
- `status`: `'success' | 'failed'`, `failReason`: nullable
- `paidAt`: timestamp

### Group 컬럼 추가

- `freeGamesUsed`: int, default 0 — 전 그룹이 0에서 시작하므로 기존 그룹 "+10 보너스"가 별도 마이그레이션 없이 충족된다. 기존 경기 수는 세지 않는다.
- `customerKey`: varchar, nullable — 무작위 UUID (토스 권고: 예측 가능한 값 금지). 서버가 최초 결제 시도 시 생성해 저장하고 재사용한다. 프론트 SDK 호출에 필요하므로 status 응답에는 포함한다 (`billingKey`와 달리 노출 가능).

### 엔티티 개편 시 주의 (`synchronize: true`)

- 백엔드 재시작 즉시 운영 DB 스키마가 변경된다 — **배포 전 운영 DB의 `subscription`/`payment` 테이블이 실제로 비어 있는지 확인**할 것 (비어 있어야 컬럼 drop/추가가 무해).
- `User.entity.ts`의 `subscriptions`/`payments` relation 제거도 이 개편에 포함된다.

### 설정값

Backend `.env.*`:

- `TOSS_SECRET_KEY` (시크릿 — 프론트 노출 금지)
- `SUBSCRIPTION_PRICE_MONTHLY` (기본 9900)
- `SUBSCRIPTION_PRICE_YEARLY` (기본 99000)
- `FREE_GAME_LIMIT` (기본 10)

Frontend: `NEXT_PUBLIC_TOSS_CLIENT_KEY` (빌드 시점에 박히므로 배포 시 이미지 재빌드 필요 — PROJECT_CONTEXT.md 참고)

## 결제 플로우 (신규 `subscription` 모듈)

1. **카드 등록**: `/subscription` 페이지에서 토스 SDK `requestBillingAuth()` 호출 (`customerKey`는 서버가 생성해 Group에 저장한 무작위 UUID) → 성공 리다이렉트로 `authKey` 수신 → `POST /subscription/billing-key` → 백엔드가 토스 `/v1/billing/authorizations/issue`로 빌링키 발급·저장
2. **첫 결제**: 빌링키 발급 직후 즉시 결제 → 성공 시 `active`, 기간 설정 (월 +1개월 / 연 +1년). 금액은 항상 서버 설정값 — 클라이언트는 주기(`billingCycle`)만 전달하고 금액은 전달할 수 없다
   - 빌링키 발급 + 첫 결제는 하나의 단위로 취급: **첫 결제 실패 시 빌링키를 저장하지 않고 폐기**, Payment `failed` 기록 후 전체 실패 응답 → 사용자는 카드 등록부터 다시 시도
   - 이미 유효 구독(`active`/`past_due`)이 있는 그룹의 요청은 409로 거부 (이중 결제 방지)
3. **자동 갱신**: `@nestjs/schedule` 크론(매일 새벽 1회)이 `currentPeriodEnd`가 지난 `active` 구독과 유예 중인 `past_due` 구독을 빌링키로 결제
   - 성공: 기간 연장 (`currentPeriodEnd` 기준으로 +1주기)
   - 실패: `past_due` 전환, 3일간 매일 재시도, 유예 중 프리미엄 유지, `currentPeriodEnd + 3일`을 지나서도 실패 시 `expired`
4. **해지**: `cancelAtPeriodEnd = true`만 설정. 남은 기간은 사용 가능, 만료일에 `canceled` 처리 및 자동결제 중단. 해지 취소(재활성화) 가능. 즉시 환불은 스코프 제외 (필요 시 수동 처리)
5. 토스 웹훅 연동은 스코프 제외 — 빌링 결제는 서버가 직접 호출해 응답을 동기로 받으므로 필수가 아님. 카드 만료/빌링키 삭제 같은 외부 이벤트는 통지받지 못하지만, 다음 갱신 결제 실패 → `past_due` 경로로 결국 감지되므로 수용 가능한 리스크로 본다.

운영 환경이 단일 인스턴스(EC2 + docker-compose)이므로 크론 중복 실행 문제는 없다.

**신규 백엔드 의존성**: `@nestjs/schedule` (크론). `app.module.ts`에 `ScheduleModule.forRoot()` 등록 필요.

### API 엔드포인트 (모두 JWT 가드, groupId는 `req.user.groupId`만 신뢰)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/subscription/status` | 구독 상태 + 남은 무료 경기 수 + 가격 정보 |
| POST | `/subscription/billing-key` | authKey로 빌링키 발급 + 첫 결제 (body: `authKey`, `billingCycle`) |
| POST | `/subscription/cancel` | 해지 예약 (`cancelAtPeriodEnd = true`) |
| POST | `/subscription/resume` | 해지 예약 취소 |
| GET | `/subscription/payments` | 결제 내역 (페이지네이션) |

## 기능 게이팅 (경기 생성 제한)

`saveGameAndLogs`는 `dto.id` 유무로 **신규 생성**과 **기존 게임 덮어쓰기(수정)**를 모두 처리한다. 게이팅은 신규 생성에만 적용한다.

- `POST /game` (`saveGameAndLogs`) 진입 시:
  - **`dto.id` 있음 (기존 게임 수정)**: 게이팅/카운터 제외. 소유권 검증만 수행한다 (한도 도달 후에도 기존 게임 기록 수정은 가능해야 함).
  - **`dto.id` 없음 (신규 생성)**:
    - 그룹에 `active` 또는 `past_due` 구독이 있으면 무제한 통과
    - 없으면 `group.freeGamesUsed >= FREE_GAME_LIMIT`일 때 **402 Payment Required** + 에러 코드 `SUBSCRIPTION_REQUIRED`
    - 통과 시 경기 저장과 같은 트랜잭션 안에서 `freeGamesUsed` 증가 (경기 삭제해도 카운트 유지 — 우회 방지)
- **동시성**: 카운터 증가는 원자적 `UPDATE ... SET freeGamesUsed = freeGamesUsed + 1`로 수행하고, 증가 후 값이 한도를 초과하지 않았는지 트랜잭션 안에서 재확인한다 (동시 요청 2건이 같은 값을 읽고 둘 다 통과하는 레이스 방지). 초과 시 롤백하고 402.
- 조회 API는 전부 현행 유지 (항상 무료)

## 그룹 삭제와 구독의 상호작용

- `deleteGroup`은 `isDeleted = true` soft delete다. `active`/`past_due` 구독이 있는 그룹이 삭제되면 크론이 삭제된 그룹에 계속 자동결제하게 된다 → **그룹 삭제 시 유효 구독을 즉시 해지(자동결제 중단, `canceled` 처리)**한다. 남은 기간 환불은 스코프 제외(수동 처리).
- **선결 보안 수정**: 현재 `DELETE /group/:id`는 JWT 가드만 있고 `assertSameGroup` 검증이 없어 인증된 아무 사용자나 남의 그룹(결제 중인 그룹 포함)을 삭제할 수 있다. 결제가 얽히기 전에 `req.user.groupId`와 대상 그룹 일치 검증을 추가한다.

## 프론트엔드

- **`/subscription` 페이지 신설** (설정 페이지에서 진입):
  - 현재 상태 카드: 무료 잔여 횟수 / "구독 중 · 다음 결제일" / 유예 중 결제 실패 안내
  - 플랜 선택 (월/연, 서버가 내려준 가격 표시) → 토스 카드 등록 → 결제
  - 구독 중: 해지 예약/취소 버튼, 결제 내역 리스트
- **402 공통 처리**: `@/lib/axios` 인터셉터에서 `SUBSCRIPTION_REQUIRED` 응답 감지 → 토스트 + `/subscription` 이동 (기존 401 처리 패턴과 동일 방식, `toastBus` 사용)
- 경기 생성 화면에 남은 무료 횟수 배지 (잔여가 적을 때)
- 신규 의존성: `@tosspayments/tosspayments-sdk`

## 에러 처리 & 보안

- `TOSS_SECRET_KEY`는 backend `.env`에만 존재. `billingKey`는 API 응답에서 제외 (`customerKey`는 SDK 호출용으로 status 응답에만 포함)
- 모든 구독 API는 JWT 가드, groupId는 토큰 값만 신뢰 (기존 `assertSameGroup` 패턴)
- 결제 금액은 서버 설정값만 사용 — 클라이언트가 금액을 조작할 수 없음
- `orderId` unique 제약으로 중복 결제 방지, 크론은 기간 체크로 멱등
- 토스 API 실패는 Payment `failed` + `failReason` 기록 + Winston 로그
- request DTO는 전역 ValidationPipe(`whitelist` + `forbidNonWhitelisted`)에 맞춰 작성
- **가격 변경 정책**: `SUBSCRIPTION_PRICE_*`를 변경하면 기존 구독자의 다음 갱신 금액도 새 값으로 청구된다 (구독 시점 가격 고정 아님) — 의도된 동작.
- **무료 티어 우회 인지**: `freeGamesUsed`는 게임 삭제-재생성 우회는 막지만, 신규 그룹 + 신규 계정 생성으로 10회를 다시 받는 것은 막지 않는다. 무료 티어 설계상 수용하는 것으로 결정.

## 테스트

- 유닛 테스트 (jest, `*.spec.ts`):
  - 게이팅: 10회 초과 시 402 / 구독 중 통과 / 유예(past_due) 중 통과 / 카운터 증가
  - 기존 게임 수정(`dto.id` 있음) 시 게이팅 미적용 + 카운터 비증가
  - 동시 신규 생성 시 원자적 증가로 한도를 초과하지 않음
  - 기간 계산·상태 전이 (active → past_due → expired, 해지 예약)
  - 크론 갱신 로직 (토스 API mock)
  - 이미 유효 구독이 있는 그룹의 billing-key 요청은 409로 거부
  - 첫 결제 실패 시 빌링키 미저장 + 전체 실패 응답
  - 그룹 삭제 시 유효 구독이 해지됨
- 토스 HTTP 클라이언트는 주입 가능한 별도 클래스로 분리해 mock 테스트
- 토스 **테스트 키**로 수동 E2E: 카드 등록 → 첫 결제 → 해지

## 구현 순서

1. 엔티티 개편 (Subscription/Payment를 Group 기준으로, `User`의 subscriptions/payments relation 제거) + Group 컬럼(`freeGamesUsed`, `customerKey`) + 설정값
2. subscription 모듈: 토스 클라이언트, 빌링키 발급, 첫 결제, 상태/해지 API (유효 구독 중복 시 409)
3. 크론 자동갱신 + 실패/유예 처리 (`@nestjs/schedule`)
4. 게임 생성 게이팅 (402, 신규 생성만 · 원자적 카운터)
5. 그룹 삭제 시 구독 해지 + `DELETE /group/:id`에 `assertSameGroup` 보안 수정
6. 프론트: 구독 페이지, 402 인터셉터, 잔여 횟수 표시

## 스코프 제외 (명시)

- 토스 웹훅 수신
- 즉시 환불 / 부분 환불
- 플랜 업/다운그레이드 (단일 플랜이므로 해당 없음), 월↔연 전환은 해지 후 재구독으로 처리
- 관리자용 구독 관리 화면
