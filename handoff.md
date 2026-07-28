# 작업 인수인계 (handoff)

- 최종 갱신: 2026-07-28
- 브랜치: `main`
- 다음 담당: 다른 기기에서 이어서 작업

## 지금 어디까지 왔나

### 완료 — SES 이메일 인증 복구 (배포됨)

`ac7bd2a` "feat: AWS SES 프로덕션 승인에 따라 회원가입 이메일 인증 복구"

2026-07-20에 SES 심사 미승인으로 임시 우회했던 회원가입 이메일 인증을 원복했다.
ap-northeast-2 프로덕션 액세스 승인 확인 후, 백엔드(`assertVerified`·`markConsumed`·
DTO 필수화)와 프론트(`EmailCodeVerification` 게이트)를 한 커밋에 묶어 동시 배포했다.

- CI Deploy 런 성공 (2026-07-27 08:44 UTC)
- 상세는 `PROJECT_CONTEXT.md` 5.4 참고

### 완료 — 문의·피드백 경로 설계 (구현 전)

브레인스토밍을 마치고 설계 문서를 확정했다.

**→ `docs/superpowers/specs/2026-07-28-inquiry-feedback-design.md`**

다음 기기에서는 **이 스펙 문서를 먼저 읽는 것으로 시작하면 된다.**

확정된 결정 요약:

| 항목 | 결정 |
|---|---|
| 수신 경로 | 앱 내 폼 → DB 저장 → `/admin`에서 조회 |
| 접근 권한 | 로그인 사용자만 |
| 폼 항목 | 유형(bug/feature/billing/etc) + 내용 |
| 진입점 | `/settings` 계정 카드의 버튼 |
| 회신 | 관리자가 `/admin`에서 답변 입력 → SES 메일 발송 |
| 데이터 모델 | 단일 `Inquiry` 엔티티 (답변 1회, 대화 스레드 없음) |

설계의 핵심 두 가지:

1. **답변 저장과 메일 발송을 한 트랜잭션에 묶는다.** 발송 실패 시 롤백되어 `pending`으로
   남으므로, "관리자는 답변했다고 생각하는데 사용자는 못 받은" 조용한 실패가 구조적으로 막힌다.
2. **`Inquiry.user`에 FK를 걸지 않고 `authorEmail` 스냅샷을 따로 저장한다.**
   `UserService.deleteUser`가 하드 삭제라 FK를 걸면 탈퇴가 실패한다.
   `Log.player`·`InGamePlayer.player`와 같은 관행이다.

## 다음에 할 일

1. **스펙 리뷰** — `docs/superpowers/specs/2026-07-28-inquiry-feedback-design.md`를 읽고
   바꾸고 싶은 부분이 있는지 확인한다.
2. **구현 계획 작성** — `writing-plans` 스킬로 스펙을 실행 계획으로 옮긴다.
   결과물은 `docs/superpowers/plans/2026-07-28-inquiry-feedback.md`가 된다.
   (`docs/superpowers/plans/` 아래 기존 계획서들이 포맷 참고가 된다)
3. **TDD로 구현** — 스펙의 "테스트 계획" 절에 케이스가 정리되어 있다.
   특히 *메일 발송 실패 시 롤백되어 `pending`으로 남는다*가 핵심 케이스다.
4. **배포** — 백엔드·프론트가 함께 가야 한다. CI에서 두 잡이 같은 sha로 배포되는지 확인할 것.

## 남은 TODO (`docs/featurelist.md`)

- [ ] 문의, 피드백 받을 경로 추가 ← **지금 이 작업. 설계 완료, 구현 대기**
- [ ] 메인 페이지가 스크롤 안되게(특히 기록화면) 그리고 기록화면 가려지는 버튼 없게
- [ ] 공유 카드에 들어가는 워딩들 개선
- [ ] 메뉴얼 페이지를 소개 페이지로 변경
- [ ] GA 적용
- [ ] 마케팅 이어서 진행
- [ ] 배포중 접속 시 nginx 에러 페이지 나오는데 서버점검중 페이지로 변경

## 미해결 이슈

- **우회 기간 가입 계정 감사** — 2026-07-20 ~ 07-27 사이에 이메일 소유 증명 없이 생성된
  계정이 있을 수 있다. 가입일 기준으로 훑어볼 필요가 있다. (`PROJECT_CONTEXT.md` 9절)
- **SES 아이덴티티 `hny0611@naver.com`이 `VerificationStatus: FAILED`** — 발신용으로 쓸 수 없다.
  수신은 프로덕션 승인으로 제약이 없다. 이 주소를 발신에 쓸 계획이면 재검증이 필요하다.
- **Dockerfile Node 버전 스큐** — 운영 컨테이너는 `node:20`, CI `setup-node`는 22다.
  (`PROJECT_CONTEXT.md` 3.3)

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
