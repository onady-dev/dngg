# 작업 인수인계 (handoff)

- 최종 갱신: 2026-07-29
- 브랜치: `main` + **미머지 feature 브랜치 3개** (아래 "진행 중인 브랜치" 참고)
- 다음 담당: 다른 기기에서 이어서 작업
- 2026-07-29: 문의·피드백 후속 과제 1·2·3·4·5·7·8을 `main`에 머지·배포 (`3c7cd16`).
  남은 것은 6번뿐이며, 문의 삭제 기능이 생길 때 함께 처리하면 된다.

## ⚠️ 진행 중인 브랜치 3개 — 먼저 읽을 것

세 갈래 작업이 각자 다른 이유로 멈춰 있다. **전부 로컬 브랜치이므로 푸시하지 않으면
다른 기기에서 보이지 않는다.** `deploy.yml`은 `push: branches: [main]`만 트리거하므로
feature 브랜치를 푸시해도 배포는 일어나지 않는다 — 안전하게 올릴 수 있다.

| 브랜치 | 상태 | 막고 있는 것 |
|---|---|---|
| `feature/ga-analytics` | 구현·리뷰·최종리뷰 완료 | **GA4 속성 생성 + repo Variable 등록** (사람) |
| `feature/landing-intro` | 구현·리뷰·최종리뷰 완료 | GA 배포 순서 대기 |
| `feature/privacy-page` | 설계만 완료 | **사업자 정보 6개 값** (사람) |

**머지 순서가 고정돼 있다: `ga-analytics` → `landing-intro` → `privacy-page`.**
`privacy-page`가 `landing-intro`에서 갈라져 나왔기 때문이다(랜딩 하단에 방침 링크를 걸어야
하는데 `LandingHero.tsx`가 그 브랜치에만 있다). 코드 충돌은 없지만 `handoff.md`와
`docs/featurelist.md`는 세 브랜치가 모두 고치므로 **나중에 머지하는 쪽이 텍스트 충돌을
해결해야 한다**(`git merge-tree`로 확인함).

### 1. `feature/ga-analytics` — GA4 계측

`page_view`·`sign_up`·`share_click` 세 이벤트와 로그인 사용자 `user_id`를 수집한다.

- 설계 `docs/superpowers/specs/2026-07-28-ga-analytics-design.md`
- 계획 `docs/superpowers/plans/2026-07-28-ga-analytics.md`

**푸시 전에 사람이 해야 할 것 (순서 중요):**

1. GA4 속성 + 웹 데이터 스트림 생성 → 측정 ID `G-XXXXXXXXXX`.
   이때 **데이터 보관을 2개월 → 14개월로** 바꿀 것. **소급 적용되지 않는다.**
2. GitHub repo Settings → Secrets and variables → Actions → **Variables 탭**(Secrets 아님)에
   `NEXT_PUBLIC_GA_ID` 등록.

**등록이 코드 푸시보다 먼저다.** 값이 빌드 시점에 번들에 박히는데, 나중에 등록하면
CI 경로 필터상 `frontend/**`가 안 바뀌는 한 프론트 잡이 돌지 않아 아무 일도 일어나지 않는다.
그때는 `workflow_dispatch`를 써야 하는데 그건 백엔드까지 재배포한다.

배포 후: `player_id`·`method`를 GA4 맞춤 측정기준으로 등록해야 리포트에 보인다.

**최종 리뷰가 배포 전에 잡은 두 가지 (수정 완료, 알아둘 것):**

- **토스 결제 자격증명이 GA4로 새어나갈 뻔했다.** gtag가 `page_location`으로 전체 URL을
  자동 수집하는데, 토스 빌링 인증이 `/subscription?...&customerKey=<uuid>&authKey=<자격증명>`
  으로 리다이렉트한다. `customerKey`는 Group 행에 영속되는 계정별 식별자다.
  → `pageview()`가 `SENSITIVE_QUERY_KEYS`를 제거한 URL을 명시 전달한다.
  **쿼리스트링에 자격증명·식별자를 담는 새 라우트를 만들면 이 목록에 추가할 것.**
- **`track()`이 가입 성공을 실패로 뒤집을 수 있었다.** `Signup.tsx`의 `track("sign_up")`이
  성공한 `POST /user` 뒤 try 블록 안에 있어서, throw하면 "회원가입에 실패했습니다"가 뜨는데
  계정은 이미 생성된 상태였다. → `track()`·`setAnalyticsUser()` 내부 try/catch로 경계에서 강제.

### 2. `feature/landing-intro` — 소개(랜딩) 화면

로그아웃 방문자가 `/`에 오면 "그룹을 선택해주세요" 대신 제품 소개와 가입 CTA를 본다.

- 설계 `docs/superpowers/specs/2026-07-28-landing-intro-design.md`
- 계획 `docs/superpowers/plans/2026-07-28-landing-intro.md`

**알아둘 것:**

- **분기는 `page.tsx`의 `if (!selectedGroup)` 블록 *안에서* 갈라진다.** `!user`를 바깥에서
  먼저 검사하면 안 된다 — `/group/all`이 공개 API라 비로그인 사용자도 헤더에서 그룹을 골라
  기록을 볼 수 있는데, 그 경로가 막힌다.
- **랜딩 이미지는 가명화한 로컬 DB에서 새로 캡처했다.** 매뉴얼 스크린샷에는 실제 사용자
  이름이 있었고, 능력치 레이더 구현 이전 화면이라 캡션과도 어긋났다. 세 번째 이미지는
  `/player/[id]/opengraph-image`가 만드는 실제 공유 카드다. 재캡처 절차는 계획서 Task 1에 있다.
- **`<img>`에 `width`/`height` 속성을 주면서 CSS `aspect-ratio`로 박스를 잡을 때는
  CSS에 `height: auto`를 반드시 넣을 것.** 안 넣으면 height 속성이 CSS height로 잡혀
  aspect-ratio가 무시되고 `object-fit: cover`가 가로를 잘라낸다. 빌드·타입·리뷰를 전부
  통과했는데도 이미지 절반이 날아가 있었다.
- **`landing_cta_click`은 GA가 배포되기 전까지 아무것도 수집하지 않는다.** 그래서 GA를
  먼저 올린다. 랜딩 전환율을 묻기 전에 이걸 확인할 것.

### 3. `feature/privacy-page` — 개인정보처리방침 (설계만)

- 설계 `docs/superpowers/specs/2026-07-28-privacy-policy-design.md`
- 계획서 없음 — 아래 값을 받아야 쓸 수 있다.

**사람이 채워야 하는 값**: 상호, 대표자 성명, 사업자등록번호, 사업장 주소,
개인정보 보호책임자(성명·직책·이메일), 시행일.

설계에서 확정된 것: `/privacy` 서버+클라이언트 컴포넌트 구조, 링크는 랜딩 하단과
`/settings` 계정 카드, 방침 12개 절 + 이 서비스 고유의 두 절(팀원 정보 / 탈퇴 후 남는 것),
그리고 **이메일 인증 기록 7일 정리 크론**. 인증 테이블이 발송 rate limit(24시간 창)에
쓰이므로 `createdAt` 7일 기준으로 자른다 — 24시간 내 행을 지우면 한도 제한이 무너진다.

## 지금 어디까지 왔나

### 완료 — SES 이메일 인증 복구 (배포됨)

`ac7bd2a` "feat: AWS SES 프로덕션 승인에 따라 회원가입 이메일 인증 복구"

2026-07-20에 SES 심사 미승인으로 임시 우회했던 회원가입 이메일 인증을 원복했다.
ap-northeast-2 프로덕션 액세스 승인 확인 후, 백엔드(`assertVerified`·`markConsumed`·
DTO 필수화)와 프론트(`EmailCodeVerification` 게이트)를 한 커밋에 묶어 동시 배포했다.

- CI Deploy 런 성공 (2026-07-27 08:44 UTC)
- 상세는 `PROJECT_CONTEXT.md` 5.4 참고

### 완료 — 문의·피드백 경로 (구현 완료)

로그인 사용자가 `/inquiry` 폼에서 문의를 남기면 `inquiry` 테이블에 저장되고,
관리자가 `/admin`의 문의 카드에서 답변하면 SES로 작성자에게 회신 메일이 나간다.

- 설계: `docs/superpowers/specs/2026-07-28-inquiry-feedback-design.md`
- 계획: `docs/superpowers/plans/2026-07-28-inquiry-feedback.md`
- 작업 로그: `.superpowers/sdd/progress.md` — 태스크별 리뷰 결과·스모크 기록.
  **git에 올라가지 않는 로컬 스크래치**이므로 다른 기기에는 없다. 이 문서가 요약본이다.

| 항목 | 결정 |
|---|---|
| 수신 경로 | 앱 내 폼 → DB 저장 → `/admin`에서 조회 |
| 접근 권한 | 로그인 사용자만 |
| 폼 항목 | 유형(bug/feature/billing/etc) + 내용(2000자) |
| 진입점 | `/settings` 계정 카드의 `문의·피드백` 버튼 |
| 회신 | 관리자가 `/admin`에서 답변 입력 → SES 메일 발송 |
| 데이터 모델 | 단일 `Inquiry` 엔티티 (답변 1회, 대화 스레드 없음) |

**엔드포인트**: `POST /inquiry` (jwt) / `GET /admin/inquiries` (jwt+admin) /
`POST /admin/inquiries/:id/answer` (jwt+admin)

설계의 핵심 두 가지 — 여기를 건드릴 때 반드시 알아야 할 것:

1. **답변 저장과 메일 발송이 한 트랜잭션이다.** 발송 실패 시 롤백되어 `pending`으로 남는다.
   불변식: **`status === 'answered'`이면 회신 메일이 실제로 발송되었다.** 재답변(덮어쓰기 +
   재발송)이 곧 재시도 경로다. 실제 SES로 발송 실패를 유도해 3회 모두 `pending` 유지를 확인했다.
2. **`Inquiry.user`에 FK가 없고 `authorEmail` 스냅샷으로 회신한다.**
   `UserService.deleteUser`가 하드 삭제라 FK를 걸면 탈퇴가 실패한다.
   `Log.player`·`InGamePlayer.player`와 같은 관행. 탈퇴한 사용자의 문의에도 답장할 수 있다.

부수적으로 추가된 것:

- **`assertMailConfigured` 부팅 가드** (`mail.service.ts` → `main.ts`) — `NODE_ENV`가
  `prod`/`production`인데 `MAIL_FROM`이 비어 있으면 부팅을 중단한다. 이게 없으면
  `MailService.send`의 dev 폴백이 조용히 no-op 해서 위 불변식이 깨진다.
  **서버 `.env`에 `MAIL_FROM`이 반드시 있어야 한다** (2026-07-28 확인: 설정됨).
- `MailService`에 private `send(to, subject, body)` 추출 — 인증 메일과 회신 메일이 공유.

## 남은 TODO (`docs/featurelist.md`)

아래 `GA 적용`과 `메뉴얼 페이지를 소개 페이지로 변경`은 **코드가 이미 다 됐고 머지만 남았다** —
위 "진행 중인 브랜치" 참고. 각 브랜치가 머지되면 자기 줄을 지운다.

- [ ] 메인 페이지가 스크롤 안되게(특히 기록화면) 그리고 기록화면 가려지는 버튼 없게
- [ ] 공유 카드에 들어가는 워딩들 개선
- [ ] 메뉴얼 페이지를 소개 페이지로 변경
- [ ] GA 적용
- [ ] 마케팅 이어서 진행
- [ ] 배포중 접속 시 nginx 에러 페이지 나오는데 서버점검중 페이지로 변경

## 미해결 이슈

- **우회 기간 가입 계정 감사** — 2026-07-20 ~ 07-27 사이에 이메일 소유 증명 없이 생성된
  계정이 있을 수 있다. 가입일 기준으로 훑어볼 필요가 있다. (`PROJECT_CONTEXT.md` 9절)
- **Dockerfile Node 버전 스큐** — 운영 컨테이너는 `node:20`, CI `setup-node`는 22다.
  (`PROJECT_CONTEXT.md` 3.3)

## 문의·피드백 후속 과제 — 2026-07-29 배포 완료

**6번을 제외한 전부(1·2·3·4·5·7·8)가 `main`에 머지되어 운영 배포됐다**
(`3c7cd16`, CI Deploy 성공). 아래 항목별 내용은 그때 알게 된 것들의 기록이다.

1. ~~**`Logger.error`의 스택이 프로젝트 전체에서 유실된다**~~ — **완료**.
   printf 본문을 `backend/src/common/log-format.ts`의
   `formatLogLine`으로 추출하고 `stack`을 읽도록 고쳤다.

   **한 줄 수정이 아니었다.** 두 가지가 걸려 있었다:
   - `stack`은 **배열**(`stack: [trace || error.stack]`)이고, trace 없이 호출하면
     `[undefined]`가 온다 — truthy라 그냥 렌더하면 `undefined`가 찍힌다.
   - **`HttpExceptionFilter`가 `errorLog` 객체를 스택/컨텍스트 위치 인자에 넘기고 있었고,
     그 안에 요청 `body`(가입·로그인 평문 비밀번호)가 들어 있었다.** printf가 `trace`를
     읽던 동안에는 출력되지 않았을 뿐이다. `stack`을 읽는 순간 로그로 샌다.
     → 필터가 문자열만 넘기도록 함께 고쳤고, `formatLogLine`도 문자열이 아닌
     stack·context 항목은 버린다. **Nest `LoggerService`의 위치 인자
     (`error(message, stack, context)` / `warn(message, context)`)에 구조화 객체를
     넘기지 말 것.**

   부수 효과로 4xx 로그의 `[[object Object]]` 컨텍스트도 사라진다.
2. ~~**`bootstrap()`에 `.catch` 없음**~~ — **완료**.
   `backend/src/common/bootstrap-failure.ts`의 `reportBootstrapFailure`를
   `bootstrap().catch(...)`로 연결했다. 핸들러를 별도 모듈로 뺀 이유는 `main.ts`가
   import 즉시 앱을 띄워 테스트에서 불러올 수 없기 때문이다.
   제안된 `console.error(e.message)`와 달리 **스택도 메시지 뒤에 함께 출력한다** —
   가드가 아닌 부팅 실패(DB 연결 거부, 포트 점유)는 스택이 있어야 진단된다.
3. ~~**`main.ts`가 `assertMailConfigured`를 호출한다는 것 자체는 테스트가 없다**~~ —
   **완료**. `backend/src/main.spec.ts`가 프로세스를 직접 띄워 검증한다.

   **CI 빌드 스텝은 필요 없었다.** `dist/main.js` 대신 ts-node로 `src/main.ts`를 띄우면
   약 1초다(`ts-node/register/transpile-only` + `tsconfig-paths/register`, 둘 다 이미
   devDependency).

   **종료 코드만 검사하면 공허하게 통과한다** — 가드를 실제로 지우고 돌려보니
   `JwtStrategy`가 `JWT_SECRET` 없이 뜨지 못해 종료 코드는 그대로 1이었다.
   그래서 stderr의 `MAIL_FROM` 메시지로 원인을 특정한다. 가드를 제거하면 실패하고
   되돌리면 통과하는 것까지 확인했다.
4. ~~**`GET /admin/inquiries`에 페이지네이션·인덱스 없음**~~ — **완료**.
   응답이 `{ rows, total, page, limit }` 봉투로 바뀌었다(기본 20건, 최대 100건).
   `(status, createdAt)` 복합 인덱스 + `createdAt` 인덱스를 엔티티에 추가했고
   `synchronize: true`라 백엔드 재시작 시 자동 생성된다(로컬에서 생성·EXPLAIN 확인).

   응답 형태가 바뀌는 파괴적 변경이라 프론트·백엔드가 함께 가야 했다. 한 커밋에
   양쪽이 모두 들어 있어 두 잡이 다 돌았고, **`workflow_dispatch`는 필요 없었다** —
   `deploy` 잡이 `needs.*.result != 'failure'` 조건이라 한쪽이라도 빌드에 실패하면
   배포 자체가 스킵된다. 앞으로도 양쪽을 한 커밋에 담으면 일반 푸시로 안전하다.
5. ~~**관리자 답변 실패 토스트가 원인을 구분하지 않는다**~~ — **완료**.
   매핑을 순수 함수 `frontend/src/app/admin/inquiryError.ts`로 분리했다.
   **401은 토스트를 띄우지 않는다** — axios 인터셉터가 로그아웃 + `/settings`
   리다이렉트와 자체 토스트를 이미 처리하므로 중복이다(`lib/axios.ts` 참고).

   **프론트엔드에는 테스트 러너가 없다**(`package.json`에 test 스크립트·의존성 없음,
   CI frontend 잡은 Docker 이미지 빌드만 한다). 그래서 이 변경은 자동 테스트가 없고
   로컬 백엔드로 여섯 경로를 실제 유발해 검증했다. 프론트 로직이 더 늘어나면
   vitest 도입을 검토할 것.
6. **`answer()`가 `manager.update`의 `affected`를 무시**하고 `findOne`이 락을 걸지 않는다.
   현재 문의 삭제 경로가 없어 도달 불가. 삭제 기능이 생기면 `pessimistic_write` 필요.
7. ~~**`data-source.ts`의 엔티티 목록에 `Inquiry`가 없다**~~ — **완료**.
   14개 중 7개가 빠져 있었다(`AppSetting`·`EmailVerification`·`Inquiry`·`Payment`·
   `Subscription`·`Team`·`TeamPlayer`). 전부 등록하고 `data-source.spec.ts`가
   엔티티/마이그레이션 디렉토리와 등록 목록의 불일치를 잡도록 했다.

   **여기 적혀 있던 `DROP TABLE` 예측은 틀렸다.** 로컬 DB로 실제 확인한 결과,
   TypeORM은 등록되지 않은 테이블을 **그냥 무시할 뿐 지우지 않는다.** 실제 실패
   양상은 침묵이다 — `Inquiry`에 컬럼을 추가하고 `migration:generate`를 돌리면
   등록 후에는 `ALTER TABLE`이 나오지만 등록 전에는 `No changes`가 나온다.
   `synchronize: false` 전환 후 이 엔티티들을 고치면 마이그레이션이 아예 생성되지
   않아 DB와 코드가 조용히 어긋난다. DROP보다 나쁘다 — DROP은 리뷰에서 눈에 띈다.
8. ~~**admin 카드 4개가 조회 실패와 "데이터 없음"을 구분하지 않는다**~~ — **완료**.
   `CardFallback` 컴포넌트로 로딩·실패를 구분하고 네 카드에 함께 적용했다.

   **가장 위험했던 것은 유료화 카드다** — 조회 실패가 "아직 시작 전입니다"로 표시되면서
   되돌릴 수 없는 "유료화 서비스 시작" 버튼이 함께 떴다. 지금은 실패 시 버튼이 사라진다.

   미답변 집계는 목록과 별도 쿼리라 재시도가 **두 쿼리를 함께** 되살린다. 이 쿼리만
   실패하면 0이 아니라 "미답변 집계 실패"로 표시한다 — 0은 거짓이 된다.

## 다른 기기에서 세팅하기

전체 절차는 `CLAUDE.md`의 "로컬에서 전체 스택 실행"에 있다. 요약하면:

```bash
git clone <repo> && cd dngg
cd backend  && pnpm install
cd ../frontend && pnpm install
docker compose up -d db          # Postgres
cd backend  && pnpm dev          # :3010
cd frontend && pnpm dev          # :3011
```

**팀 시크릿에서 따로 받아야 하는 것** (git에 없음):

- `backend/.env.dev`
- `frontend/.env.development` (`frontend/.env.dev`를 이 이름으로 복사)
- 루트 `.env` (docker compose용 `DB_USERNAME`/`DB_PASSWORD`/`DB_DATABASE`)

pnpm 버전은 CI와 맞춰 `11.13.1`을 쓴다. pnpm 11.x는 Node 22.13+가 필요하다.

**진행 중인 브랜치를 이어받으려면** 먼저 푸시돼 있어야 한다(`git push -u origin <브랜치>`).
feature 브랜치 푸시는 배포를 일으키지 않는다 — `deploy.yml`이 `push: branches: [main]`만 본다.
`.superpowers/sdd/`의 작업 로그(태스크별 리뷰 결과·스모크 기록)는 **git에 올라가지 않는
로컬 스크래치**라 다른 기기에는 없다. 이 문서가 그 요약본이다.

## 주의사항 (반복해서 문제가 됐던 것들)

- **`main`에 푸시하면 곧바로 운영에 배포된다.** 경로 필터로 `backend/**` → 백엔드 잡,
  `frontend/**` → 프론트 잡이 돈다.
- **`docker compose down -v`를 절대 쓰지 말 것** — Postgres 볼륨이 날아간다.
- **`pg-data/`는 건드리지 말 것.**
- `synchronize: true`라 엔티티 변경이 백엔드 재시작 즉시 실제 DB에 반영된다.
- 프론트 `NEXT_PUBLIC_API_URL`은 **빌드 시점에 값이 박힌다.** 서버 `.env`만 바꿔도 효과가 없다.
- 커밋 메시지 설명은 한글, conventional 타입 접두어(`feat:`/`fix:`/`docs:`)는 영문.
