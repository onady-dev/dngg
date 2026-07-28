# GA4 계측 도입 — 설계

- 작성일: 2026-07-28
- 대상: `frontend/` (Next.js 14 App Router)
- 상태: 설계 승인됨
- 배경: `docs/superpowers/specs/2026-07-19-marketing-gtm-design.md` 5절(지표),
  `docs/superpowers/plans/2026-07-19-marketing-phase0.md` E절(계측)

## 0. 왜 지금인가

마케팅 Phase 0의 완료 기준에 "4개 핵심 이벤트 계측 수집 시작"이 있고, Phase 1(총무 1:1
부트스트랩)은 채널별 유입→가입 전환을 봐야 판단이 선다. 계측 없이 마케팅을 시작하면
무엇이 먹혔는지 사후에 복원할 수 없다. 그래서 마케팅 재개보다 GA를 선행한다.

## 1. 현재 상태 (조사 결과)

- `frontend/src/lib/analytics.ts`에 `track(event, props)` 추상화가 이미 있다.
  `NEXT_PUBLIC_ANALYTICS_URL`이 있으면 `sendBeacon`, 없으면 dev 콘솔 로그.
  실제 제공자는 연결된 적이 없다.
- `track()` 호출부는 `frontend/src/app/player/[id]/ShareButton.tsx` 한 곳(3줄)뿐이다.
- **회원가입이 곧 그룹 생성이다.** `POST /user`가 트랜잭션 안에서 `Group`을 무조건
  하나 만든다(`backend/src/modules/user/user.service.ts:48`). 프론트에는 `POST /group`
  호출부가 존재하지 않는다.
- 초대 링크 기능은 구현되어 있지 않다.
- 프론트엔드에 테스트 러너가 없다(`package.json` scripts: `dev`/`build`/`start`/`lint`).
- 개인정보처리방침·이용약관 페이지가 없다.

## 2. 결정 사항

| 항목 | 결정 | 근거 |
|---|---|---|
| 도입 방식 | 직접 gtag + `next/script` | 의존성 0, pageview가 우리 코드에 보임 |
| pageview | `usePathname()` 기반 수동 발화 | `@next/third-parties`는 GA4 향상된 측정에 위임 — App Router에서 누락·중복의 흔한 원인 |
| `useSearchParams` | 쓰지 않음 | Suspense 경계 강제 + 정적 렌더 de-opt. gtag가 `document.location`을 직접 읽어 UTM은 최초 pageview에 담긴다 |
| user_id | 로그인 사용자의 숫자 id 연동 | 기기 간 여정 병합 → 공유→가입 전환 정확도 |
| 개인정보 고지 | 이번 범위 밖 (후속 TODO) | 기술 작업과 분리해 배포 속도 확보 |
| 동의 배너 | 도입 안 함 | 국내 서비스에 법적 의무 아님. 데이터 유실 대비 실익 없음 |
| 기존 sendBeacon 경로 | 제거 | 자체 수집기 계획 없음. 제공자 둘을 동시에 물 이유 없음 |

## 3. 아키텍처

### 3.1 파일

소스 파일 기준 신규 1개, 수정 4개. 설정 파일(`.env.example`·`Dockerfile`·`deploy.yml`)은 5절.

**`frontend/src/lib/analytics.ts`** (수정, ~30줄 → ~80줄)

별도 `gtag.ts`를 만들지 않고 이 파일에 흡수한다. 이 파일이 이미 "제공자 연결은 여기
한 곳만 바꾸면 된다"고 선언해 뒀고, GA4 로직을 넣어도 80줄이라 한눈에 들어온다.

export 5개:

- `GA_MEASUREMENT_ID` — `process.env.NEXT_PUBLIC_GA_ID ?? ""`
- `isAnalyticsEnabled()` — 측정 ID가 있고 브라우저 환경일 때만 `true`
- `track(event, props)` — **시그니처 불변**. 내부만 `gtag('event', ...)`로 교체
- `pageview(path)` — `gtag('event', 'page_view', { page_path, page_location })`.
  `page_location`은 발화 시점의 `document.location`에서 읽되 민감 쿼리 파라미터를
  제거해 **명시적으로** 보낸다(4절 파라미터 규칙). UTM은 제거 목록에 없어 그대로 남는다
- `setAnalyticsUser(id | null)` — `gtag('set', { user_id })`

이 모듈이 `window.dataLayer`와 `gtag` 스텁을 **직접 보장한다**:

```js
window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }
```

React effect가 `afterInteractive` 스크립트보다 먼저 돌 수 있어서, 스텁이 없으면 초기
이벤트가 조용히 유실된다. `dataLayer`는 큐이므로 `gtag.js`가 나중에 로드돼도 밀린
항목이 그대로 처리된다.

**`frontend/src/app/components/AnalyticsProvider.tsx`** (신규 client component, ~45줄)

세 가지를 담당한다:

1. **스크립트 렌더** — `<Script src="https://www.googletagmanager.com/gtag/js?id=…"
   strategy="afterInteractive">` + inline `config`. config에 `send_page_view: false`,
   dev에서만 `debug_mode: true`.
   **측정 ID가 없으면 `null`을 반환**해 스크립트를 아예 붙이지 않는다 — 로컬 개발이
   운영 속성을 오염시키지 않는다.
2. **pageview** — `usePathname()` 변경마다 `pageview()`. `send_page_view: false`이므로
   최초 진입 pageview도 여기서 한 번만 나간다(중복 없음).
3. **user_id 동기화** — `useAuthStore.subscribe`로 user 변경 감지 → `setAnalyticsUser()`.
   로그인·로그아웃·axios 401 만료가 **전부 이 스토어의 `logout()`을 거치므로**
   (`frontend/src/lib/axios.ts:44`) 호출부를 각각 고칠 필요가 없다. persist rehydrate
   덕에 새로고침 세션 복원도 자동으로 잡힌다.

**`frontend/src/app/layout.tsx`** (수정) — `<body>` 최하단에 `<AnalyticsProvider />`.

**`frontend/src/app/components/Signup.tsx`** (수정) — `POST /user` 성공 직후 `sign_up` 발화.

**`frontend/src/app/player/[id]/ShareButton.tsx`** (수정) — 파라미터 키 `playerId` → `player_id`.

### 3.2 데이터 흐름

```
라우트 변경     → usePathname → pageview(path)   ─┐
제품 행동       → track(name, props)             ─┼→ window.dataLayer → gtag.js → GA4
로그인/로그아웃 → store subscribe → user_id set   ─┘
```

## 4. 이벤트 스펙

| 이벤트 | 발화 지점 | 파라미터 |
|---|---|---|
| `page_view` | `AnalyticsProvider` pathname 변경 | `page_path` |
| `sign_up` | `Signup.tsx` — `POST /user` 성공 직후 | `method: "email"` |
| `share_click` | `ShareButton` (기존 3곳) | `player_id`, `method` |

### 의도적으로 넣지 않는 것

- **`group_created`** — 가입이 곧 그룹 생성이라(1절) `sign_up` 수 = 신규 그룹 수다.
  이벤트를 둘로 두면 같은 숫자를 두 번 센다. 마케팅 계획의 "신규 그룹 수" 지표는
  `sign_up`으로 충족된다.
- **`invite_accepted`** — 초대 기능이 없다. 범위 밖.
- **`login`** — GA4가 세션·활성 사용자를 이미 집계한다. 필요해지면 한 줄이다.

### 파라미터 규칙

- **snake_case로 통일한다.** GA4 맞춤 측정기준은 파라미터 이름으로 등록되고
  `page_path` 등 표준 파라미터가 전부 snake_case다. `share_click`의 `playerId`를
  `player_id`로 바꾸는 이유가 이것이다. `track()` 시그니처 자체는 변하지 않는다.
- **PII 금지.** 이메일·이름·**그룹명**은 파라미터에 절대 넣지 않는다. 그룹명은 사용자가
  입력한 실제 팀 이름이라 식별 정보에 해당하고, GA4는 PII 전송을 계정 정지 사유로 본다.
  `user_id`는 숫자 ID만 보낸다. 이 규칙을 `analytics.ts` 주석에 명시한다.
- **`page_location`은 민감 쿼리 파라미터를 제거한 뒤 명시적으로 보낸다.** 토스 결제
  리다이렉트 복귀 URL(`/subscription?...&customerKey=…&authKey=…`, 실패 시
  `?fail=1&code=…&message=…`)이 자동 수집되면 `customerKey`(Group에 영속되는 계정별
  식별자)와 `authKey`(결제 인증 자격증명)가 그대로 GA4로 나간다. `pageview()`가
  `SENSITIVE_QUERY_KEYS`(`authKey`·`customerKey`·`token`·`code`)를 제거한 URL을
  `page_location`으로 명시 전달해 gtag의 자동값을 덮어쓴다. UTM 파라미터는 이 목록에
  없으므로 의도적으로 그대로 남는다 — 채널 분석에 필요하기 때문이다.

### 알려진 정상 동작

`sign_up`은 가입 성공 시점에 나가는데 그 순간은 아직 로그인 전이라 `user_id`가 없다.
GA4가 client_id로 묶고, 직후 로그인에서 `user_id`가 붙으면서 같은 사용자로 연결된다.

## 5. 측정 ID 주입 경로

`NEXT_PUBLIC_*`는 빌드 시점에 번들에 박힌다. `NEXT_PUBLIC_TOSS_CLIENT_KEY`와 동일 경로로
네 곳을 거친다:

1. `frontend/.env.example` — `NEXT_PUBLIC_GA_ID=` (빈 값, 로컬 기본 꺼짐)
2. `frontend/Dockerfile` — `ARG NEXT_PUBLIC_GA_ID` + `ENV NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID`
3. `.github/workflows/deploy.yml` — frontend 잡 `build-args`에 추가
4. GitHub repo **Variables**에 `NEXT_PUBLIC_GA_ID` 등록

Secret이 아니라 **Variable**이다. 측정 ID는 번들과 HTML에 그대로 노출되는 공개 값이고,
Secret으로 넣으면 로그 마스킹만 지저분해진다.

### 순서가 중요하다

**repo variable 등록이 먼저, 코드 푸시가 나중이다.** variable을 나중에 추가하면 아무 일도
일어나지 않는다 — 값이 빌드 시점에 박히는데, CI 경로 필터상 `frontend/**`가 안 바뀌면
프론트 잡 자체가 돌지 않기 때문이다.

## 6. 에러 처리

계측은 절대 제품을 멈추지 않는다.

- 측정 ID가 없으면 스크립트를 안 붙이고 모든 함수가 조용히 반환한다.
- 광고 차단기가 `gtag.js`를 막아도 스텁은 `dataLayer.push`만 하므로 예외가 나지 않는다.
  큐가 쌓이지만 세션당 수십 건이라 무시할 수준이다.
- `track()`은 `void`이고 throw하지 않는다. `ShareButton`의 공유 로직은 계측 성공 여부와
  무관하게 진행된다. **이 불변식은 `track()`·`setAnalyticsUser()` 내부의 `try/catch`로
  경계에서 강제한다** — `gtag.js`가 로드된 뒤에는 `window.gtag`와 `dataLayer.push`가
  전부 구글 코드라 우리 제어 밖에서 던질 수 있다. 호출부에서 감싸지 않는다.
  (`Signup.tsx`의 `sign_up`은 이미 성공한 `POST /user` 뒤에 있어서, 여기서 throw하면
  가입에 성공한 사용자에게 "회원가입에 실패했습니다"가 뜨고 재시도는 중복 이메일로 막힌다.)

## 7. 검증

프론트엔드에 테스트 러너가 없다(1절). GA 한 건 때문에 Jest/Vitest를 들이는 것은 이 작업의
범위를 넘어선다 — 별도 과제로 남기고, 수동 스모크 3단계로 검증한다.

1. **꺼짐 확인** — 로컬에서 `NEXT_PUBLIC_GA_ID` 없이 `pnpm dev`. 스크립트 미주입,
   googletagmanager 네트워크 요청 0건, 콘솔에 `[track]` 로그만.
2. **DebugView** — 로컬 `.env.development`에 테스트용 측정 ID를 넣고 GA4 DebugView에서
   `page_view`(라우트 이동 포함)·`sign_up`·`share_click`과 `user_id` 부착을 확인.
   dev에서만 붙는 `debug_mode: true`가 이를 가능하게 한다.
3. **운영 스모크** — 배포 후 실시간 보고서에서 `page_view` 확인 + 공유 버튼 1회 눌러
   `share_click` 확인.

## 8. 직접 해야 하는 선행/후속 작업 (콘솔)

선행:

1. GA4 속성 + 웹 데이터 스트림 생성 → 측정 ID `G-XXXXXXXXXX` 확보
2. GitHub repo Variables에 `NEXT_PUBLIC_GA_ID` 등록 (코드 푸시 **전에**)

배포 후:

3. `player_id`·`method`를 맞춤 측정기준으로 등록 (등록해야 리포트에 노출된다)
4. (권장) 데이터 보관 기간 2개월 → 14개월. **나중에 소급되지 않는다**
5. (권장) 내부 트래픽 필터로 개발자 IP 제외

## 9. 이 작업이 만드는 후속 TODO

- **`/privacy` 개인정보처리방침 페이지** — GA는 쿠키/식별자를 심으므로 국내
  개인정보보호법상 고지 대상이다. 현재 방침·약관 페이지가 아예 없다. 고지 없이
  운영되는 기간이 생기는 것을 인지한 상태로 진행한다.
- **프론트엔드 테스트 인프라** — 러너가 없어 계측 회귀를 자동으로 잡을 수 없다.
- **이메일 인증 단계 이탈 계측** — SES 복구 직후라 인증 요청→완료→가입 완료 깔때기의
  이탈 지점이 궁금할 수 있다. 지금은 범위 밖.
