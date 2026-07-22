# DNGG 토스 구독 결제 Go-Live 계획서

- 작성일: 2026-07-21
- 상태: **Phase 0(테스트 키 E2E 검증) 완료 — 2026-07-22.** Phase 1(가맹점 심사)·2(웹훅)·3(배포 배선)·4(라이브)·5(롤아웃) 대기
- 성격: **운영 실결제 활성화 런북** — 기능 개발이 아니라 이미 구현된 구독 결제를 실제 서비스에서 돈이 오가게 만드는 절차서
- 선행 문서:
  - `docs/superpowers/specs/2026-07-13-subscription-design.md` (기능 설계, 승인·구현·병합 완료)
  - `docs/superpowers/plans/2026-07-14-subscription.md` (구현 계획)

---

## 1. 배경 — 지금 어디까지 되어 있나

구독 결제 **기능 코드는 이미 구현·병합(PR #1)되어 main에 있다.** 다시 만들 것이 없다.

이미 존재하는 것:

| 영역 | 상태 |
|------|------|
| 백엔드 모듈 `backend/src/modules/subscription/` | 서비스·컨트롤러·토스 빌링 클라이언트·크론·유닛테스트 14파일 |
| 엔티티 | `Subscription`/`Payment`(그룹 기준), `Group.freeGamesUsed`/`customerKey` |
| 배선 | `app.module.ts`에 `SubscriptionModule` + `ScheduleModule.forRoot()` |
| API | `GET /subscription/status`, `POST /subscription/billing-key`, `POST /subscription/cancel`, `POST /subscription/resume`, `GET /subscription/payments` |
| 게이팅 | 무료 경기 10회 초과 시 402 `SUBSCRIPTION_REQUIRED` |
| 크론 | 매일 자동갱신 + 3일 유예 → `past_due`/`expired` 전이 |
| 프론트 | `/subscription` 페이지 + 토스 빌링 인증 플로우 + 402 인터셉터 리다이렉트 |
| 관리자 | 그룹·구독 현황 조회 API |

**따라서 이 계획서는 "붙이는 개발"이 아니라 "켜는 절차"다.** 남은 것은 (a) 아직 한 번도 검증 안 된 결제 플로우를 테스트 키로 확인, (b) 토스 가맹점 계약·심사(외부, 미신청), (c) 실서비스 신뢰성을 위한 최소 웹훅 추가, (d) 운영 배포 배선의 누락 수정, (e) 실카드 검증과 롤아웃이다.

## 2. 결정 사항 (사용자 확인 완료)

- **토스 가맹점 계약: 아직 신청 안 함** → 신청·심사 절차를 계획에 포함(크리티컬 패스).
- **테스트 키 E2E: 미검증** → 라이브 이전에 **테스트 키 검증 게이트(Phase 0)**를 반드시 선행.
- **웹훅: 최소 포함** → 실결제인 만큼 결제 상태 변경 웹훅을 추가 구현.
- **Phase 0 검증 환경: 로컬**(colima + 로컬 스택). `localhost:3011`은 이미 CORS 허용 origin이고 토스 테스트 API는 로컬에서 동작한다.

## 3. 착수 전 발견된 Go-Live 블로커 (코드/인프라 실측)

설계 문서에는 없던, 실제 배포 구성을 뜯어보고 발견한 것들. **이걸 고치지 않으면 배포해도 결제가 조용히 실패한다.**

### 3.1 🚨 docker-compose backend에 구독 환경변수 미전달

`backend/src/modules/subscription/subscription.config.ts`와 `toss-billing.client.ts`는 `process.env.TOSS_SECRET_KEY` / `SUBSCRIPTION_PRICE_*` / `FREE_GAME_LIMIT`를 읽는다. 그러나 루트 `docker-compose.yaml`의 `backend.environment:` 블록에는 이 키들이 **없다**(DB/JWT/MAIL만 있음). 서버 `.env`에 값을 넣어도 컨테이너 안 프로세스로 주입되지 않는다.

- 증상: `TOSS_SECRET_KEY`가 빈 문자열 → 토스 인증 헤더가 `Basic (빈값:)` → 모든 결제 401 실패. 가격은 기본값(9900/99000)으로 폴백되어 겉보기엔 정상이라 **더 헷갈린다.**
- 조치: `docker-compose.yaml` backend `environment:`에 아래를 추가하고 **repo에 커밋**한다(배포 시 compose는 repo→서버로 덮어써짐 — 서버에서 직접 고치면 다음 배포에 날아감).

```yaml
      - TOSS_SECRET_KEY=${TOSS_SECRET_KEY}
      - SUBSCRIPTION_PRICE_MONTHLY=${SUBSCRIPTION_PRICE_MONTHLY:-9900}
      - SUBSCRIPTION_PRICE_YEARLY=${SUBSCRIPTION_PRICE_YEARLY:-99000}
      - FREE_GAME_LIMIT=${FREE_GAME_LIMIT:-10}
      - TOSS_WEBHOOK_SECRET=${TOSS_WEBHOOK_SECRET}   # Phase 2 웹훅 서명 검증용
```

### 3.2 🚨 프론트 라이브 클라이언트 키가 빌드타임인데 주입 경로 없음

`frontend/src/app/subscription/page.tsx`는 `process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY`로 토스 SDK를 로드한다. `NEXT_PUBLIC_*`는 **빌드 시점에 번들에 박히는** 값인데(PROJECT_CONTEXT.md 교훈), 현재 `frontend/Dockerfile`은 `NEXT_PUBLIC_API_URL`만 `ARG/ENV`로 받고, CI(`deploy.yml`) frontend 잡의 `build-args`도 `NEXT_PUBLIC_API_URL` 하나만 넘긴다.

- 증상: 서버 `.env`에 아무리 넣어도 무효. 클라이언트 키가 `undefined` → 페이지가 "결제 설정 오류" 처리, 카드 등록 자체가 안 뜬다.
- 조치 세 곳(모두 커밋/등록):
  1. `frontend/Dockerfile`:
     ```dockerfile
     ARG NEXT_PUBLIC_TOSS_CLIENT_KEY
     ENV NEXT_PUBLIC_TOSS_CLIENT_KEY=$NEXT_PUBLIC_TOSS_CLIENT_KEY
     ```
  2. `.github/workflows/deploy.yml` frontend 잡 `build-args`에 추가:
     ```yaml
     build-args: |
       NEXT_PUBLIC_API_URL=${{ vars.NEXT_PUBLIC_API_URL || 'https://dngg.one/api' }}
       NEXT_PUBLIC_TOSS_CLIENT_KEY=${{ vars.NEXT_PUBLIC_TOSS_CLIENT_KEY }}
     ```
  3. GitHub repo **Variables**에 `NEXT_PUBLIC_TOSS_CLIENT_KEY` 등록(라이브 클라이언트 키는 어차피 브라우저에 노출되므로 secret 아닌 variable로 충분). 값 갱신 후 **프론트 이미지 재빌드**(workflow_dispatch 권장)해야 반영.

### 3.3 웹훅 공개 경로 — 프록시 확인 필요

공개 API base는 `https://dngg.one/api`(프론트 Dockerfile ARG 기본값 · CI build-arg). 즉 EC2에 `dngg.one/api/*` → backend `:3010`으로 넘기는 리버스 프록시가 repo 밖에 있다. 웹훅 URL은 자연히 **`https://dngg.one/api/subscription/webhook`**.

- 오픈 이슈: 이 프록시(nginx 등)가 `/api/subscription/webhook`로의 POST를 backend로 넘기는지, 그리고 **body 변형 없이(raw body 보존)** 전달하는지 확인해야 한다. 서명 검증이 raw body에 의존하기 때문. (프록시 설정은 이 repo에 없음 → 서버에서 확인/수정)

### 3.4 기타 기존 배포 제약 (CLAUDE.md/PROJECT_CONTEXT.md 재확인)

- `synchronize: true` — 백엔드 재시작 즉시 스키마 반영. 첫 라이브 배포 전 운영 DB `subscription`/`payment` 테이블 상태 확인.
- CI 백엔드 잡은 `pnpm test`를 돌리고 실패 시 배포 중단 → **웹훅 유닛테스트가 통과해야 배포된다.**
- CI 헬스체크는 `/group/all`·프론트 루트만 확인 → 구독/웹훅 신규 라우트는 **수동 스모크** 필수.
- main 푸시 = 운영 배포. 프론트·백 잡은 독립 → 함께 가야 하면 CI green 확인 또는 workflow_dispatch 동시 배포.

### 3.5 Phase 0 검증 중 발견한 코드 이슈 (2026-07-22)

라이브 결제 UX에 직접 닿는 부분이라 go-live 전 정리 권장. → 이번 세션에서 수정 적용(별도 커밋).

1. **[중] 프론트 빌링키 이중 제출** — `frontend/src/app/subscription/page.tsx`의 authKey 처리 `useEffect`가 `POST /subscription/billing-key`를 2회 호출한다(dev의 React StrictMode 이중 실행에서 재현). 첫 호출은 201로 정상 구독 생성, 두 번째는 이미 소비된 authKey로 `issueBillingKey`가 실패하며 **정돈된 409가 아닌 500**을 반환한다. 데이터는 authKey 단일 사용 + `uq_active_subscription_per_group` 유니크 인덱스로 이중 결제/중복 구독이 차단되지만, 두 번째 호출이 잠깐 `activeCount` 게이트를 통과하고 500이 노출되는 점이 문제.
   - 조치: (a) `useEffect`를 `useRef` 가드로 authKey당 1회만 제출. (b) `subscribe()`에서 `issueBillingKey` 실패를 정돈된 상태코드(400)로 래핑 — 결제 이전 단계이므로 실패 Payment는 기록하지 않음.
2. **[하] 로그인/회원가입 응답에 password 해시 노출** — `POST /user`·`POST /user/login` 응답 본문에 사용자 `password`(bcrypt 해시)가 그대로 포함된다. 노출 자체가 불필요한 정보 유출.
   - 조치: `user.service.ts`의 `createUser`/`loginUser` 반환에서 `password` 제거.

---

## 4. Phase 0 — 테스트 키 E2E 검증 게이트 (로컬, 외부 의존 없음)

**목적:** 한 번도 실행 검증되지 않은 결제 플로우가 실제로 도는지 라이브 이전에 확인. **이 게이트를 통과하지 못하면 이후 단계로 가지 않는다.**

> ### ✅ 검증 결과 (2026-07-22, 로컬 스택 + 토스 테스트 키 + Playwright)
>
> **7개 시나리오 + 유예/만료 변형 전부 기대대로 통과.** 백엔드 유닛테스트 160개 PASS. 실제 토스 테스트 API로 카드등록·첫결제·재청구·거절이 모두 코드대로 동작했고, 이중 결제·중복 구독 없음.
>
> | 시나리오 | 결과 |
> |---|---|
> | status·customerKey 발급 | ✅ customerKey 신규 영속화 |
> | 카드등록→빌링키→첫결제→active | ✅ 9,900 결제, 기간 설정, UI "구독 중" |
> | 재구독 | ✅ 409 |
> | 무료한도 게이팅 | ✅ 402 `SUBSCRIPTION_REQUIRED` + 프론트 `/subscription` 리다이렉트 |
> | 해지 예약 → 재개 | ✅ |
> | 크론 갱신(성공) | ✅ 실제 재청구, 기간 연장 |
> | 갱신 실패 → past_due / 유예초과 → expired | ✅ 무효 빌링키로 실검증 |
> | 첫 결제 실패 | ✅ 유닛테스트 + 갱신실패 경로로 검증 |
>
> **런북 보정 (실측):**
> 1. **토스 전용 테스트 카드번호는 없다.** 실제 한국 카드사 BIN(앞 6자리)이 유효해야 함(예: 신한 `465887`). 임의 번호는 `NOT_SUPPORTED_CARD_TYPE`로 거절. 시크릿 키 유효성·빌링 활성은 `POST /v1/billing/authorizations/issue`에 더미 authKey를 던져 `NOT_FOUND_BILLING`이 오는지로 사전 진단 가능.
> 2. **시나리오 4(게이팅)는 `monetizationStartedAt` AppSetting ON + 비-admin 계정 + 무료한도 소진**이 전제 (`game.service.ts` 게이팅은 유료화 시작 후·비admin·무구독일 때만 402). admin·유료화 전에는 무제한.
> 3. **크론은 수동 HTTP 트리거가 없다**(`@Cron` 매일 4시). 검증 시 `NestFactory.createApplicationContext`로 앱 컨텍스트를 부팅해 `renewDueSubscriptions(new Date())`를 1회 호출하는 임시 스크립트를 사용.
>
> **Phase 0에서 발견한 코드 이슈 (별도 수정 — 아래 §3.5):**
> - [중] 프론트 빌링키 이중 제출 → 두 번째 호출이 500 반환.
> - [하] 로그인/회원가입 응답 본문에 password 해시 노출.

- [ ] 토스 개발자센터 가입 → **테스트 API 키** 발급(`test_ck_...` / `test_sk_...`). 계약 없이 즉시 발급 가능.
- [ ] 로컬 env 설정:
  - `backend/.env.dev`: `TOSS_SECRET_KEY=test_sk_...` (+ 필요 시 가격/한도)
  - `frontend/.env.development`: `NEXT_PUBLIC_TOSS_CLIENT_KEY=test_ck_...`
- [ ] 로컬 스택 기동: `colima start` → `docker compose up -d db` → `backend: pnpm dev` / `frontend: pnpm dev`
- [ ] `pnpm test`(backend) 전체 통과 확인 (기존 구독 유닛테스트).
- [ ] 수동 E2E 시나리오:
  1. `/subscription` 진입 → `status` 조회: 무료 잔여·`customerKey` 발급 확인
  2. 카드 등록(`requestBillingAuth`, 토스 테스트 카드) → `authKey` 리다이렉트 수신 → `POST /subscription/billing-key` → 빌링키 발급 + 첫 결제 → `active`
  3. 이미 유효 구독인 상태에서 재구독 시도 → **409**
  4. 게이팅: 무료 경기 10회 소진 → 신규 경기 생성 시 **402 → `/subscription` 리다이렉트**(인터셉터). 기존 경기 수정은 402 없이 통과
  5. 해지 예약(`cancel`) → 재개(`resume`)
  6. 크론 갱신: `currentPeriodEnd`를 과거로 수동 조정 후 `renewDueSubscriptions` 트리거 → (성공) 기간 연장 / (토스 실패 mock) `past_due` / (유예 초과) `expired`
  7. 첫 결제 실패 케이스(테스트 실패 카드) → 빌링키 미저장 + 402 + `failed` Payment 기록
- **완료 기준:** 위 7개 전부 기대대로. 실패 시 여기서 코드 수정하고 재검증(라이브 진행 보류).

## 5. Phase 1 — 토스페이먼츠 가맹점 신청·심사 (외부 의존 · 크리티컬 패스)

Phase 0과 **병렬로 즉시 착수.** 기간이 불확실하므로(SES 승인 지연 선례) 전체 일정의 크리티컬 패스다.

- [ ] **오픈 이슈 선확인:** DNGG 운영 사업자등록 보유 여부 / 신청 주체(개인·법인) / 정산 입금 계좌. 없으면 이 단계 자체가 블록됨.
- [ ] 토스페이먼츠 가맹점 신청 — **자동결제(빌링) 사용을 명시.** 일반결제와 별도로 빌링 계약/승인이 필요할 수 있음.
- [ ] 서비스 심사 대비 자료:
  - 실 서비스 URL(`https://dngg.one`)에서 구독 상품/가격이 보이는 화면
  - **환불·해지 정책 페이지**(전자상거래법상 요구될 수 있음 — 현재 없으면 신설 필요)
  - 이용약관 내 결제/구독 조항
- [ ] 승인 후: **라이브 키**(`live_ck_...` / `live_sk_...`) 발급, 빌링 활성화 확인, 웹훅 시크릿 확인.
- **리스크:** 심사 기간 통제 불가. Phase 2·3.1·3.2는 이 승인을 기다리지 않고 진행해 승인 즉시 배포 가능하게 준비한다.

## 6. Phase 2 — 최소 웹훅 구현 (심사 대기 중 병행, 테스트 키로 검증)

빌링 결제는 서버가 동기 응답을 받으므로 웹훅이 필수는 아니지만, 실결제에서는 **토스 콘솔/CS에서 발생한 결제 취소·상태 변경을 DB에 반영**하기 위해 최소한으로 붙인다.

### 설계

- **신규 컨트롤러 분리:** 기존 `SubscriptionController`는 클래스 레벨 `@UseGuards(AuthGuard('jwt'))`라 웹훅을 여기 둘 수 없다. `SubscriptionWebhookController`(가드 없음)를 별도로 만들어 `POST /subscription/webhook` 처리.
- **인증/무결성(이중 방어):**
  1. 서명 검증 — 토스 웹훅 서명 헤더 검증(정확한 헤더명·스킴은 토스 공식 문서로 확정). raw body 필요 → `NestFactory.create(AppModule, { rawBody: true })` 또는 body parser 설정.
  2. 서버 재조회 — 신뢰 강화를 위해 웹훅 body를 곧이곧대로 믿지 않고 `GET /v1/payments/{paymentKey}`로 토스에 실제 상태를 재확인 후 반영(위조/재전송 방어).
- **처리:** `paymentKey`/`orderId`로 기존 `Payment` 매칭 → 상태 동기화(예: 취소면 해당 결제/구독 상태 갱신). 매칭 불가·미지원 이벤트는 로깅 후 **200**(재전송 폭주 방지).
- **멱등:** 동일 이벤트 재수신 시 중복 처리 금지(이미 반영된 상태면 no-op).
- **스코프 최소화:** 결제 상태 변경 이벤트 위주. "카드 만료" 같은 선제 이벤트를 토스가 제공하지 않으면 제외 — 다음 갱신 실패 → `past_due` 경로로 감지(기존 설계 유지).

### 작업

- [ ] 토스 문서로 웹훅 이벤트 카탈로그·서명 스킴 확정 (Context7/vendor docs).
- [ ] `main.ts` raw body 설정.
- [ ] `SubscriptionWebhookController` + 서비스 메서드(`handleWebhook`) 구현.
- [ ] 토스 콘솔에 웹훅 URL 등록: `https://dngg.one/api/subscription/webhook`.
- [ ] jest 테스트: 서명 검증 성공/실패, 이벤트 처리, 멱등, 미지원 이벤트 200 — **CI 배포 게이트 통과 필수.**
- [ ] 테스트 키 환경에서 토스 콘솔 "웹훅 테스트 전송"으로 수신 확인.
- **주의:** 3.3의 프록시 raw-body 보존 이슈를 먼저 확인해야 서명 검증이 운영에서 깨지지 않는다.

> 이 Phase의 코드 부분은 규모가 있으므로, 착수 시 `writing-plans`로 task 단위 구현 계획(테스트 우선)을 별도로 뽑는 것을 권장.

## 7. Phase 3 — 운영 배포 배선 (블로커 수정 + 키 주입)

3장에서 찾은 것을 코드/설정으로 반영. **3.1·3.2·CI 변경은 심사 통과 전에 미리 커밋 가능**(값은 나중에). 라이브 키 주입만 승인 후.

- [ ] `docker-compose.yaml` backend `environment:`에 구독 env 추가 (3.1) — 커밋.
- [ ] `frontend/Dockerfile`에 `NEXT_PUBLIC_TOSS_CLIENT_KEY` ARG/ENV 추가 (3.2) — 커밋.
- [ ] `.github/workflows/deploy.yml` frontend build-args에 키 추가 (3.2) — 커밋.
- [ ] `backend/.env.example` / `frontend/.env.example`에 웹훅 시크릿 등 신규 키 문서화.
- [ ] **승인 후:** 서버 `/usr/local/project/dngg/.env`에 실값 설정:
  - `TOSS_SECRET_KEY=live_sk_...`, `SUBSCRIPTION_PRICE_MONTHLY`, `SUBSCRIPTION_PRICE_YEARLY`, `FREE_GAME_LIMIT`, `TOSS_WEBHOOK_SECRET`
- [ ] GitHub Variables에 `NEXT_PUBLIC_TOSS_CLIENT_KEY=live_ck_...` 등록.
- [ ] 운영 DB `subscription`/`payment` 테이블 상태 확인(`synchronize: true` 무해성).
- [ ] 토스 콘솔 웹훅 URL·리다이렉트(성공/실패) URL을 운영 도메인으로 설정.

## 8. Phase 4 — 라이브 검증 (심사 통과 + 배포 후)

- [ ] 배포 실행: main 병합(또는 workflow_dispatch로 프론트·백 동시 배포 — 프론트 이미지 재빌드가 반드시 포함되도록).
- [ ] **실카드 소액 E2E:** 실제 카드로 카드 등록 → 첫 결제(실 청구 발생) → 토스 콘솔에서 결제 확인 → **즉시 수동 환불**.
- [ ] 웹훅 수신 확인: 토스 콘솔에서 그 결제를 취소 → DB `Payment`/구독 상태에 반영되는지 확인.
- [ ] 크론 동작 확인: 다음 새벽 실행 로그, 또는 임시로 기간 조정해 갱신 확인.
- [ ] 게이팅 402 실동작(무료 한도 도달 계정으로) 확인.
- [ ] 신규 라우트 수동 스모크(CI 헬스체크 미커버).
- **완료 기준:** 실결제·환불·웹훅·크론·게이팅 전부 확인.

## 9. Phase 5 — 롤아웃 · 롤백 · 모니터링

- **롤아웃:** 조용한 오픈(무료 한도 도달 그룹이 자연 노출) 또는 공지 후 오픈.
- **롤백 레버(빠른 것부터):**
  1. 게이팅만 완화 — 서버 `.env` `FREE_GAME_LIMIT` 상향 후 backend 재시작(결제 막힘 즉시 해소, 배포 불필요).
  2. 프론트에서 구독 진입 숨김.
  3. 코드 문제 — 문제 커밋 revert 후 재배포(sha 핀 방식이라 revert가 정석).
- **모니터링:** Winston 로그의 토스 API 실패/`Payment failed`, 갱신 실패율, `past_due`/`expired` 추이, 첫 결제 성공률.

---

## 10. 오픈 이슈 (진행 전 사람이 확정해야 할 것)

1. **사업자 등록/신청 주체** — Phase 1 착수 전제. 없으면 전체 블록.
2. **환불·해지 정책 페이지 존재 여부** — 토스 심사 요구 가능성. 없으면 신설.
3. **EC2 리버스 프록시의 `/api/subscription/webhook` 포워딩 + raw body 보존** — Phase 2 서명 검증 전제(repo 밖 설정).
4. **가격·무료 한도 최종값** — 기본 월 9,900 / 연 99,000 / 무료 10회 그대로 갈지 확정.

## 11. 리스크 요약

| 리스크 | 영향 | 완화 |
|--------|------|------|
| 토스 심사 지연 | go-live 일정 통제 불가 | Phase 0/2/3 배선을 심사와 병렬로 미리 완료 |
| 프론트 빌드타임 키 재빌드 누락 | 브라우저가 옛/빈 키 사용, 카드 등록 불가 | Phase 3에서 Dockerfile+CI+Variables 세 곳 모두 반영, workflow_dispatch로 재빌드 |
| compose env 누락(3.1) | 결제 조용히 401 실패(가격은 폴백돼 오탐) | compose 커밋 + Phase 4 실카드 스모크 |
| 웹훅 raw body/서명/프록시 | 서명 검증 실패 또는 위조 수신 | raw body 설정 + 서버 재조회 이중 방어 + 프록시 선확인 |
| 실결제 테스트 = 실제 돈 | 소액이라도 실청구 | 소액·즉시 환불 절차 숙지 |
| synchronize:true | 재시작 시 스키마 자동 변경 | 첫 라이브 배포 전 테이블 상태 확인 |

## 12. 스코프 제외 (이번 go-live에서 하지 않음)

- 환불/부분환불 자동화(수동 처리 유지)
- 플랜 업/다운그레이드, 월↔연 전환(해지 후 재구독)
- 관리자용 구독 관리 UI(조회 API는 이미 존재)
- 카드 만료 선제 알림(토스가 push 미제공 시 — 갱신 실패로 감지)
