# 작업 인수인계 (handoff)

- 최종 갱신: 2026-07-28
- 브랜치: `main` (문의·피드백은 feature/inquiry-feedback에서 작업 후 머지)
- 다음 담당: 다른 기기에서 이어서 작업

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

### 완료 — GA4 계측 (배포됨)

`page_view`·`sign_up`·`share_click` 세 이벤트와 로그인 사용자 `user_id`를 수집한다.
마케팅 Phase 0의 계측 항목(`docs/superpowers/plans/2026-07-19-marketing-phase0.md` E절).

- 설계: `docs/superpowers/specs/2026-07-28-ga-analytics-design.md`
- 계획: `docs/superpowers/plans/2026-07-28-ga-analytics.md`

알아야 할 것 세 가지:

1. **측정 ID는 빌드 시점에 박힌다.** GitHub repo **Variables**(Secret 아님)의
   `NEXT_PUBLIC_GA_ID` → CI build-arg → Dockerfile ARG. 값을 바꾸면 프론트
   이미지를 재빌드해야 하고, `frontend/**` 변경 없이 variable만 고치면 아무 일도
   일어나지 않는다.
2. **측정 ID가 비면 계측이 통째로 꺼진다** — 스크립트를 아예 붙이지 않는다.
   로컬 오염 방지 장치지만, 운영에서 variable이 빠지면 조용히 무계측이 된다.
3. **`group_created` 이벤트는 일부러 없다.** `POST /user`가 트랜잭션 안에서 그룹을
   무조건 하나 만들어서(`user.service.ts:48`) `sign_up` 수 = 신규 그룹 수다.

`useSearchParams`를 쓰지 않은 것도 의도적이다 — 쓰면 Suspense 경계가 강제되고
정적 라우트 12개가 동적으로 바뀐다. UTM은 gtag가 `document.location`에서 읽는다.

## 남은 TODO (`docs/featurelist.md`)

- [ ] 메인 페이지가 스크롤 안되게(특히 기록화면) 그리고 기록화면 가려지는 버튼 없게
- [ ] 공유 카드에 들어가는 워딩들 개선
- [ ] 메뉴얼 페이지를 소개 페이지로 변경
- [ ] 마케팅 이어서 진행
- [ ] 배포중 접속 시 nginx 에러 페이지 나오는데 서버점검중 페이지로 변경

## 미해결 이슈

- **우회 기간 가입 계정 감사** — 2026-07-20 ~ 07-27 사이에 이메일 소유 증명 없이 생성된
  계정이 있을 수 있다. 가입일 기준으로 훑어볼 필요가 있다. (`PROJECT_CONTEXT.md` 9절)
- **SES 아이덴티티 `hny0611@naver.com`이 `VerificationStatus: FAILED`** — 발신용으로 쓸 수 없다.
  수신은 프로덕션 승인으로 제약이 없다. 이 주소를 발신에 쓸 계획이면 재검증이 필요하다.
- **Dockerfile Node 버전 스큐** — 운영 컨테이너는 `node:20`, CI `setup-node`는 22다.
  (`PROJECT_CONTEXT.md` 3.3)
- **개인정보처리방침 페이지가 없다** — GA4가 쿠키/식별자를 심으므로 국내
  개인정보보호법상 고지 대상이다. 방침·약관 페이지가 아예 없는 상태로 계측을
  시작했다(인지된 선택). `/privacy` 추가 필요.
- **프론트엔드에 테스트 러너가 없다** — 계측 회귀를 자동으로 잡을 수 없고,
  `pnpm lint`도 동작하지 않는다(`eslint.config.mjs` flat config만 있고 Next 14.1의
  `next lint`는 `.eslintrc*`를 찾아 설정 마법사가 뜬다).
- **이메일 인증 단계 이탈이 계측되지 않는다** — SES 복구 직후라 인증 요청→인증
  완료→가입 완료 깔때기의 이탈 지점이 궁금해질 수 있다. 이번 범위에서 제외했다.

## 문의·피드백 후속 과제 (머지 비차단 — 최종 리뷰에서 이월)

우선순위 순. 전부 이번 배포를 막지 않는다고 판단된 것들이다.

1. **`Logger.error`의 스택이 프로젝트 전체에서 유실된다** — `nest-winston`은 2번째 인자를
   메타 `stack`으로 넘기는데(`winston.classes.js:52`) `app.module.ts:48`의 winston printf는
   `trace`를 읽는다. `SubscriptionService`·`UserService.withTransaction` 등 모든 호출부가 영향.
   한 줄 수정이지만 전역 로그 출력이 바뀌므로 **별도 커밋으로** 처리할 것.
   (문의 기능은 원본 사유를 로그 본문에 넣어 이미 면역)
2. **`bootstrap()`에 `.catch` 없음** (`main.ts`) — 부팅 가드 에러가 unhandled rejection
   스택으로 뜬다. Node 20이 non-zero exit이라 동작은 맞지만 `docker logs`에서 한글 메시지가
   묻힌다. `bootstrap().catch(e => { console.error(e.message); process.exit(1); })`
3. **`main.ts`가 `assertMailConfigured`를 호출한다는 것 자체는 테스트가 없다** — 그 줄이
   지워지면 가드가 조용히 무력화되는데 테스트는 초록이다.
4. **`GET /admin/inquiries`에 페이지네이션·인덱스 없음** — 매 조회마다 전체 문의를
   2000자 본문째로 가져온다. 초기 볼륨에선 무해. `status`/`createdAt` 인덱스도 없다.
5. **관리자 답변 실패 토스트가 원인을 구분하지 않는다** — 404·400·네트워크 끊김도 전부
   "답변 메일 발송에 실패했습니다."로 표시된다. `error.response?.status`로 분기 필요.
6. **`answer()`가 `manager.update`의 `affected`를 무시**하고 `findOne`이 락을 걸지 않는다.
   현재 문의 삭제 경로가 없어 도달 불가. 삭제 기능이 생기면 `pessimistic_write` 필요.
7. **`data-source.ts`의 엔티티 목록에 `Inquiry`가 없다**(`Subscription`·`Team` 등도 마찬가지).
   `synchronize: false`로 전환할 때 `migration:generate`가 `DROP TABLE inquiry`를 뱉는다.
8. **admin 카드 4개가 조회 실패와 "데이터 없음"을 구분하지 않는다** — 기존 3개와 동일한
   패턴이라 하나만 고치면 오히려 불일치. 네 개를 함께 고칠 것.

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

## 주의사항 (반복해서 문제가 됐던 것들)

- **`main`에 푸시하면 곧바로 운영에 배포된다.** 경로 필터로 `backend/**` → 백엔드 잡,
  `frontend/**` → 프론트 잡이 돈다.
- **`docker compose down -v`를 절대 쓰지 말 것** — Postgres 볼륨이 날아간다.
- **`pg-data/`는 건드리지 말 것.**
- `synchronize: true`라 엔티티 변경이 백엔드 재시작 즉시 실제 DB에 반영된다.
- 프론트 `NEXT_PUBLIC_API_URL`은 **빌드 시점에 값이 박힌다.** 서버 `.env`만 바꿔도 효과가 없다.
- 커밋 메시지 설명은 한글, conventional 타입 접두어(`feat:`/`fix:`/`docs:`)는 영문.
