# 작업 인수인계 (handoff)

- 최종 갱신: 2026-08-06
- `main` 최신 배포: GA4 계측 + 소개(랜딩) 화면 — 측정 ID `G-VVC37NHFYB`
- **미머지 feature 브랜치 1개는 origin에 푸시돼 있다** — 다른 기기에서 `git fetch`로 바로 이어받을 수 있다.

## ⚠️ 진행 중인 브랜치 1개 — 먼저 읽을 것

feature 브랜치를 푸시해도 배포는 일어나지 않는다 — `deploy.yml`은 `push: branches: [main]`만 트리거한다.

| 브랜치 | 상태 | 막고 있는 것 |
|---|---|---|
| `feature/privacy-page` | 설계만 완료 | **사업자 정보 6개 값** (사람) |

### `feature/privacy-page` — 개인정보처리방침 (설계만)

- 설계 `docs/superpowers/specs/2026-07-28-privacy-policy-design.md`
- 계획서 없음 — 아래 값을 받아야 쓸 수 있다.

**사람이 채워야 하는 값**: 상호, 대표자 성명, 사업자등록번호, 사업장 주소,
개인정보 보호책임자(성명·직책·이메일), 시행일.

설계에서 확정된 것: `/privacy` 서버+클라이언트 컴포넌트 구조, 링크는 랜딩 하단과
`/settings` 계정 카드, 방침 12개 절 + 이 서비스 고유의 두 절(팀원 정보 / 탈퇴 후 남는 것),
그리고 **이메일 인증 기록 7일 정리 크론**. 인증 테이블이 발송 rate limit(24시간 창)에
쓰이므로 `createdAt` 7일 기준으로 자른다 — 24시간 내 행을 지우면 한도 제한이 무너진다.

## 남은 TODO (`docs/featurelist.md`)

- [ ] 메인 페이지가 스크롤 안되게(특히 기록화면) 그리고 기록화면 가려지는 버튼 없게
- [ ] 공유 카드에 들어가는 워딩들 개선
- [ ] 마케팅 이어서 진행
- [ ] 배포중 접속 시 nginx 에러 페이지 나오는데 서버점검중 페이지로 변경

## 미해결 이슈

- **우회 기간 가입 계정 감사** — 2026-07-20 ~ 07-27 사이에 이메일 소유 증명 없이 생성된
  계정이 있을 수 있다. 가입일 기준으로 훑어볼 필요가 있다. (`PROJECT_CONTEXT.md` 9절)
- **Dockerfile Node 버전 스큐** — 운영 컨테이너는 `node:20`, CI `setup-node`는 22다.
  (`PROJECT_CONTEXT.md` 3.3)
- **개인정보처리방침 페이지가 없다** — GA4가 쿠키/식별자를 심으므로 국내
  개인정보보호법상 고지 대상이다. 방침·약관 페이지가 아예 없는 상태로 계측을
  시작했다(인지된 선택). 위 `feature/privacy-page`가 이걸 해소한다 — **사업자 정보
  6개 값만 받으면 바로 쓸 수 있으므로 미해결 이슈 중 가장 먼저 닫을 것.**
- **루트 도메인 OG 카드가 없다** — `layout.tsx`의 metadata에 `openGraph` 블록이 없어
  `dngg.one`을 카톡·밴드에 붙여넣으면 미리보기가 비어 있다. 공유 루프의 진입 링크인데
  카드가 없는 상태다. `src/app/opengraph-image.tsx`를 `player/[id]`와 같은 `next/og`
  패턴으로 추가하면 된다. (랜딩 작업에서 `layout.tsx` 충돌을 피하려고 범위 밖으로 뺐던
  것인데, GA·랜딩이 모두 머지된 지금은 막는 게 없다.)
- **프론트엔드 `pnpm lint`가 동작하지 않는다** — `eslint.config.mjs` flat config만 있고
  Next 14.1의 `next lint`는 `.eslintrc*`를 찾아 설정 마법사가 뜬다. 테스트 러너도 없어
  (아래 "반복해서 걸린 것" 참고) 계측 회귀는 자동으로 잡히지 않는다.
- **이메일 인증 단계 이탈이 계측되지 않는다** — SES 복구 직후라 인증 요청→인증
  완료→가입 완료 깔때기의 이탈 지점이 궁금해질 수 있다. 이번 범위에서 제외했다.
- **네이버 SEO가 필요해지면** — `/`의 정적 HTML은 비어 있다(`page.tsx`의 `!mounted` 게이트).
  Googlebot은 JS를 실행하지만 네이버 크롤러는 약하다. 랜딩을 게이트 앞에서 정적으로 렌더하는
  방식으로 올릴 수 있고, 대가는 로그인 사용자가 홈 방문마다 랜딩을 한 프레임 보는 것이다.

## 배포된 기능 — 건드리기 전에 알아야 할 것

### 소개(랜딩) 화면 (2026-08-06 배포)

로그아웃 방문자가 `/`에 오면 "그룹을 선택해주세요" 대신 제품 소개와 가입 CTA를 본다.
마케팅 Phase 0의 랜딩페이지 항목(`docs/superpowers/plans/2026-07-19-marketing-phase0.md` D절).

- 설계 `docs/superpowers/specs/2026-07-28-landing-intro-design.md`
- 계획 `docs/superpowers/plans/2026-07-28-landing-intro.md`

알아야 할 것 네 가지:

1. **분기는 `page.tsx`의 `if (!selectedGroup)` 블록 *안에서* 갈라진다.** `!user`를 바깥에서
   먼저 검사하면 안 된다 — `/group/all`이 공개 API라 비로그인 사용자도 헤더에서 그룹을 골라
   기록을 볼 수 있는데, 그 경로가 막힌다.
2. **메뉴얼(`/manual/index.html`)은 그대로 남아 있다.** 헤더 nav의 `manual` 아이콘과
   로그인 사용자의 "그룹을 선택해주세요" 화면에서 여전히 연결된다. 랜딩에는 일부러 안 넣었다
   (단일 CTA).
3. **이미지는 `next/image`를 쓰지 않는다.** 이 프로젝트에 `sharp`가 없어 운영 `next start`의
   이미지 최적화가 깨진다. `public/landing/`의 미리 리사이즈한 PNG를 평범한 `<img>`로 쓴다.
   스크린샷을 갈아끼울 때 `sips --resampleWidth 800`으로 폭을 맞출 것(`-Z`는 긴 변을 맞춰서
   세로로 긴 이미지의 폭이 어긋난다). 그리고 `<img>`에 `width`/`height` 속성을 주면서
   CSS `aspect-ratio`로 박스를 잡을 때는 **CSS에 `height: auto`를 반드시 넣어야 한다** —
   안 넣으면 height 속성이 CSS height로 잡혀 aspect-ratio가 무시되고 `object-fit: cover`가
   가로를 잘라낸다(실제로 겪었다).
4. **랜딩 이미지는 가명화한 로컬 DB에서 새로 캡처한 것이다.** 매뉴얼 스크린샷에는 실제
   사용자 이름이 들어 있었다. 갈아끼울 때 실데이터가 찍히지 않도록 주의할 것. 세 번째
   이미지는 `/player/[id]/opengraph-image`가 만드는 실제 공유 카드다. 재캡처 절차는
   계획서 Task 1에 있다.

`landing_cta_click`은 GA가 먼저 배포된 뒤에 올라갔으므로 처음부터 수집된다.
랜딩 전환율을 묻기 전에 이 이벤트가 실제로 들어오는지부터 확인할 것.

### GA4 계측 (2026-08-06 배포)

`page_view`·`sign_up`·`share_click`·`landing_cta_click` 네 이벤트와 로그인 사용자
`user_id`를 수집한다.
마케팅 Phase 0의 계측 항목(`docs/superpowers/plans/2026-07-19-marketing-phase0.md` E절).
측정 ID `G-VVC37NHFYB` (데이터 보관 14개월).

- 설계 `docs/superpowers/specs/2026-07-28-ga-analytics-design.md`
- 계획 `docs/superpowers/plans/2026-07-28-ga-analytics.md`

**배포 후 남은 사람 작업**: `player_id`·`method`를 GA4 맞춤 측정기준으로 등록해야
리포트에서 이 파라미터로 나눠 볼 수 있다. 보관 기간과 마찬가지로 **소급 적용되지 않으니**
빨리 등록할 것 — 등록 전에 들어온 이벤트는 파라미터 값 없이 집계된다.

알아야 할 것:

1. **측정 ID는 빌드 시점에 박힌다.** GitHub repo **Variables**(Secret 아님)의
   `NEXT_PUBLIC_GA_ID` → CI build-arg → Dockerfile ARG. 값을 바꾸면 프론트
   이미지를 재빌드해야 하고, `frontend/**` 변경 없이 variable만 고치면 아무 일도
   일어나지 않는다.
2. **측정 ID가 비면 계측이 통째로 꺼진다** — 스크립트를 아예 붙이지 않는다.
   로컬 오염 방지 장치지만, 운영에서 variable이 빠지면 조용히 무계측이 된다.
3. **`group_created` 이벤트는 일부러 없다.** `POST /user`가 트랜잭션 안에서 그룹을
   무조건 하나 만들어서(`user.service.ts:48`) `sign_up` 수 = 신규 그룹 수다.
4. **`page_location`은 민감 쿼리 파라미터를 제거하고 명시적으로 보낸다.** 토스 결제
   복귀 URL의 `authKey`·`customerKey`가 자동 수집을 통해 GA4로 새 나가는 것을 막으려고
   `analytics.ts`의 `SENSITIVE_QUERY_KEYS`로 걸러낸다. 새 라우트가 쿼리스트링에 자격증명·
   식별자를 담아 리다이렉트를 받는다면 이 목록에 추가해야 한다.
   `customerKey`는 Group 행에 영속되는 계정별 식별자라 한 번 나가면 회수할 수 없다.
5. **`track()`·`setAnalyticsUser()`는 throw하지 않는다 (설계 §6 불변식).** 내부 try/catch로
   경계에서 강제한다. `Signup.tsx`의 `track("sign_up")`이 성공한 `POST /user` 뒤 try 블록
   안에 있어서, 던지면 계정은 생성됐는데 "회원가입에 실패했습니다"가 뜬다. 계측 호출을
   성공 경로 뒤에 새로 넣을 때 이 불변식에 기대도 된다.

`useSearchParams`를 쓰지 않은 것도 의도적이다 — 쓰면 Suspense 경계가 강제되고
정적 라우트(현재 10개)가 동적으로 바뀐다. UTM은 gtag가 `document.location`에서 읽는다.

### 문의·피드백 (2026-07-28 ~ 29 배포)

로그인 사용자가 `/inquiry` 폼에서 문의를 남기면 `inquiry` 테이블에 저장되고,
관리자가 `/admin`의 문의 카드에서 답변하면 SES로 작성자에게 회신 메일이 나간다.

- 설계 `docs/superpowers/specs/2026-07-28-inquiry-feedback-design.md`
- 계획 `docs/superpowers/plans/2026-07-28-inquiry-feedback.md`

**엔드포인트**

| 엔드포인트 | 권한 | 비고 |
|---|---|---|
| `POST /inquiry` | jwt | 유형(bug/feature/billing/etc) + 내용(2000자) |
| `GET /admin/inquiries` | jwt+admin | `{ rows, total, page, limit }` — 기본 20건, 최대 100건 |
| `POST /admin/inquiries/:id/answer` | jwt+admin | 답변 1회, 대화 스레드 없음 (재답변은 덮어쓰기) |

**목록 응답은 배열이 아니라 봉투다.** `?status=pending&limit=1`로 `total`만 읽으면
미답변 건수를 싸게 구할 수 있다 — 관리자 화면이 그렇게 쓴다.

**여기를 고칠 때 반드시 알아야 할 세 가지:**

1. **답변 저장과 메일 발송이 한 트랜잭션이다.** 발송 실패 시 롤백되어 `pending`으로 남는다.
   불변식: **`status === 'answered'`이면 회신 메일이 실제로 발송되었다.** 재답변(덮어쓰기 +
   재발송)이 곧 재시도 경로다. 실제 SES로 발송을 실패시켜 확인했다.
2. **`Inquiry.user`에 FK가 없고 `authorEmail` 스냅샷으로 회신한다.**
   `UserService.deleteUser`가 하드 삭제라 FK를 걸면 탈퇴가 실패한다.
   `Log.player`·`InGamePlayer.player`와 같은 관행. 탈퇴한 사용자의 문의에도 답장할 수 있다.
3. **`answer()`는 행을 `pessimistic_write`로 잠그고 `update`의 `affected`를 확인한다.**
   문의 삭제 기능을 만들면 이 두 가지가 실제로 쓰인다 — SELECT와 UPDATE 사이에 행이
   사라져도 회신 메일이 나가지 않는다. 잠금 비용은 없다(어차피 UPDATE가 커밋까지 행 잠금을 쥔다).

**`assertMailConfigured` 부팅 가드** (`mail.service.ts` → `main.ts`) — `NODE_ENV`가
`prod`/`production`인데 `MAIL_FROM`이 비어 있으면 부팅을 중단한다. 이게 없으면
`MailService.send`의 dev 폴백이 조용히 no-op 해서 위 1번 불변식이 깨진다.
**서버 `.env`에 `MAIL_FROM`이 반드시 있어야 한다** (2026-07-28 확인: 설정됨).
`backend/src/main.spec.ts`가 프로세스를 직접 띄워 이 배선이 살아있는지 검증한다.

### SES 이메일 인증 복구 (2026-07-27 배포)

`ac7bd2a`. 2026-07-20에 SES 심사 미승인으로 임시 우회했던 회원가입 이메일 인증을 원복했다.
ap-northeast-2 프로덕션 액세스 승인 후, 백엔드(`assertVerified`·`markConsumed`·DTO 필수화)와
프론트(`EmailCodeVerification` 게이트)를 한 커밋에 묶어 동시 배포했다.
상세는 `PROJECT_CONTEXT.md` 5.4.

SES 아이덴티티는 `dngg.one`, `onady.dev@gmail.com` 둘 다 `SUCCESS`.
(`hny0611@naver.com`은 `FAILED` 상태였고 2026-07-29에 삭제했다.)

## 이 코드베이스에서 반복해서 걸린 것

2026-07-29에 후속 과제 8건을 정리하며 확인한 것들. 전부 실제로 재현해 본 내용이다.

- **Nest `LoggerService`의 위치 인자에 구조화 객체를 넘기지 말 것.**
  `error(message, stack, context)` / `warn(message, context)`이다. `HttpExceptionFilter`가
  여기에 요청 메타 객체를 넘기고 있었고 그 안에 **요청 `body`(가입·로그인 평문 비밀번호)**가
  들어 있었다. 로그 포맷터(`backend/src/common/log-format.ts`)는 이제 문자열이 아닌
  stack·context 항목을 버려 구조화 객체가 로그로 새지 않게 막는다.
- **`nest-winston`은 2번째 인자를 메타 `stack`에 배열로 넘긴다**(`stack: [trace || err.stack]`).
  `trace`를 읽으면 스택이 통째로 유실되고, 인자 없이 호출하면 `[undefined]`가 온다.
- **TypeORM은 `data-source.ts`에 등록되지 않은 테이블을 무시할 뿐 지우지 않는다.**
  실패 양상은 `DROP TABLE`이 아니라 **침묵**이다 — 미등록 엔티티를 고쳐도 마이그레이션이
  아예 생성되지 않아 `synchronize: false` 전환 후 DB와 코드가 조용히 어긋난다.
  `backend/src/data-source.spec.ts`가 엔티티/마이그레이션 디렉토리와 등록 목록의
  불일치를 잡는다 — 엔티티를 추가하면 이 테스트가 알려준다.
- **프론트엔드에는 테스트 러너가 없다.** `frontend/package.json`에 test 스크립트도 의존성도
  없고, CI frontend 잡은 Docker 이미지 빌드만 한다(lint도 안 돈다). 프론트 로직 검증은
  수동이거나 Playwright를 임시로 붙여야 한다. 로직이 더 늘어나면 vitest 도입을 검토할 것.
- **`/admin`의 카드는 조회 실패와 "데이터 없음"을 구분해야 한다.** `CardFallback`
  (`frontend/src/app/admin/CardFallback.tsx`)을 쓴다. 카드를 추가할 때 이 패턴을 따를 것 —
  특히 유료화 카드는 조회 실패를 "아직 시작 전"으로 표시하면 **되돌릴 수 없는 시작 버튼이
  함께 뜬다.**
- **401에는 토스트를 띄우지 말 것.** `frontend/src/lib/axios.ts` 인터셉터가 로그아웃 +
  `/settings` 리다이렉트 + 자체 토스트를 이미 처리한다. 호출부에서 또 띄우면 중복이다.
  실패 사유 분기 예시는 `frontend/src/app/admin/inquiryError.ts`.

## 배포

**`main`에 푸시하면 곧바로 운영에 배포된다.** 경로 필터로 `backend/**` → 백엔드 잡,
`frontend/**` → 프론트 잡이 돈다. 루트의 `.md`만 고치면 아무 잡도 돌지 않는다.

**프론트·백엔드가 함께 가야 하는 변경은 한 커밋에 양쪽을 담으면 된다.** 두 잡이 다 돌고
같은 sha로 핀되며, `deploy` 잡이 `needs.*.result != 'failure'` 조건이라 **한쪽이라도
빌드에 실패하면 배포 자체가 스킵**된다. `workflow_dispatch`까지 쓸 필요는 없다.
(2026-07-29에 문의 목록 API 파괴적 변경을 이 방식으로 배포해 확인함.)

**CI 헬스체크는 `/group/all`과 프론트 루트만 본다** — 배포가 success여도 신규 기능 라우트는
직접 스모크할 것. 인증이 필요한 화면은 실제로 로그인해서 봐야 한다.

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

`.superpowers/sdd/`의 작업 로그는 **git에 올라가지 않는 로컬 스크래치**라 다른 기기에는 없다.
이 문서가 그 요약본이다.

## 주의사항 (반복해서 문제가 됐던 것들)

- **`docker compose down -v`를 절대 쓰지 말 것** — Postgres 볼륨이 날아간다.
- **`pg-data/`는 건드리지 말 것.**
- `synchronize: true`라 엔티티 변경이 백엔드 재시작 즉시 실제 DB에 반영된다(인덱스도 자동 생성).
- 프론트 `NEXT_PUBLIC_API_URL`은 **빌드 시점에 값이 박힌다.** 서버 `.env`만 바꿔도 효과가 없다.
- **`pnpm lint`(백엔드)는 `eslint --fix`라 저장소 전체를 포맷팅한다.** 변경 파일만 보려면
  `npx eslint <파일>`을 쓸 것. 저장소에 기존 lint 에러가 많고 CI는 lint를 돌지 않는다.
- **`next dev`가 떠 있는 동안 `pnpm build`를 돌리지 말 것** — 둘 다 `.next/`를 써서
  개발 서버가 깨진다(404/500 청크). 깨졌으면 `.next` 삭제 후 재시작.
- 백엔드 watch 인스턴스가 여러 개 뜨면 나중 것이 `EADDRINUSE`로 죽고 **옛 프로세스가 포트를
  계속 잡는다.** 설정을 바꿔 재기동했는데 반영이 안 되면 이걸 의심할 것.
- 커밋 메시지 설명은 한글, conventional 타입 접두어(`feat:`/`fix:`/`docs:`)는 영문.
