# 개인정보처리방침 페이지 — 설계

- 작성일: 2026-07-28
- 대상: `frontend/` (Next.js 14 App Router), `backend/` (NestJS)
- 상태: 설계 승인됨 — **단, 6절의 사업자 정보가 채워지기 전에는 구현에 들어갈 수 없다**
- 배경: `handoff.md` 미해결 이슈 "개인정보처리방침 페이지가 없다"
- 브랜치: `feature/privacy-page` (base: `feature/landing-intro` ee01330)

## 0. 왜 지금인가

GA4 계측(`feature/ga-analytics`)이 배포 대기 중이다. 배포되면 쿠키와 기기 식별자를 심게 되는데
현재 방침·약관 페이지가 **아예 없다**. 개인정보 보호법 제30조는 개인정보를 처리하는 자에게
처리방침 수립·공개 의무를 지운다. GA 도입 설계에서 이 공백을 인지하고 별도 과제로 미룬 것을
여기서 닫는다.

## 1. 현재 상태 (코드에서 확인한 사실)

방침 문구는 아래 실측에 맞춘다. 추측으로 쓰지 않는다.

**수집·저장 항목**

| 엔티티 | 항목 |
|---|---|
| `User` | `email`(고유), `password`(bcrypt 해시), `name`, `createdAt`, `role`, `groupId` |
| `EmailVerification` | `email`, `purpose`, `codeHash`(SHA-256 — 평문 코드 미저장), `expiresAt`, `attemptCount`, `consumedAt` |
| `Inquiry` | `userId`(FK 없음), `authorEmail`(작성 시점 스냅샷), `type`, `content`, `answer`, `status` |
| `Group` | `name`(사용자 입력 팀 이름), `customerKey`(`randomUUID`, 토스 결제용) |
| `Player` | `name`, `backnumber` — **총무가 대신 입력하는 제3자 정보** |
| `Payment` | `amount`, `orderId`, `externalPaymentId`(토스 paymentKey), `status`, `failReason`, `paidAt` — **카드정보 없음** |
| `Subscription` | 상태·기간 |
| `Game`·`Log`·`Team` | 경기 기록(선수와 연결) |

**동작 사실**

- **탈퇴는 `userRepository.delete(id)`가 전부다**(`user.service.ts:133`). `DELETE /user/:id`는
  백엔드에 있으나 **프론트에서 호출하는 곳이 없다** — 탈퇴 UI가 존재하지 않는다.
- 따라서 탈퇴해도 그룹·선수·경기·로그가 남고, `Inquiry.authorEmail` 스냅샷도 남는다.
  이건 의도된 설계다(탈퇴자의 문의에도 답장할 수 있도록).
- **`EmailVerification` 행은 무기한 남는다.** 발송 실패 시에만 삭제하고
  (`email-verification.service.ts:92`) 정리 로직이 없다.
- 그 테이블은 **rate limit에 쓰인다**: `RESEND_COOLDOWN_MS`가 최신 1건의 `createdAt`을 보고,
  `DAILY_SEND_LIMIT`이 `createdAt > now - 24h` 건수를 센다(`email-verification.service.ts:54-72`).
  **24시간 내 행을 지우면 발송 한도 제한이 무너진다.**
- 서비스는 AWS 서울 리전(ap-northeast-2)에서 운영된다. 메일은 SES, 결제는 토스페이먼츠.
- 프론트엔드에 푸터가 없고 헤더 nav는 6칸(daily·rankings·teams·games·settings·manual)이 차 있다.

## 2. 결정 사항

| 항목 | 결정 | 근거 |
|---|---|---|
| 구현 방식 | 서버 컴포넌트(`metadata`) + 클라이언트 컴포넌트(styled) | styled-components는 클라이언트 전용. `player/[id]`가 이미 같은 구조. `/privacy`가 정적 프리렌더된다 |
| 운영 주체 표기 | 사업자 정보 포함 | 유료 결제를 받는 서비스 |
| 탈퇴 경로 | 문의(`/inquiry`)로 안내 | 탈퇴 UI 신설은 별도 과제. 문의 기능은 이미 동작한다 |
| 링크 위치 | 랜딩 하단 + `/settings` 계정 카드 | 푸터가 없고 `layout.tsx`는 GA 브랜치가 수정 중이라 못 건드린다 |
| 인증 기록 보유 | **7일 후 자동 삭제 크론을 함께 만든다** | 무기한 보관은 필요 최소 보유 원칙에 어긋난다. 방침과 실제 동작을 일치시킨다 |
| styled 정의 위치 | `PrivacyContent.tsx` 안에 인라인 | 한 곳에서만 쓴다. `page.tsx`의 `GuideButton`이 선례 |

## 3. 아키텍처

### 3.1 프론트엔드

| 파일 | 상태 | 책임 |
|---|---|---|
| `frontend/src/app/privacy/page.tsx` | 신규 | 서버 컴포넌트. `export const metadata`, `<PrivacyContent />` 렌더 |
| `frontend/src/app/privacy/PrivacyContent.tsx` | 신규 | `"use client"` + 방침 본문 + styled 정의 |
| `frontend/src/app/components/LandingHero.tsx` | 수정 | 하단에 방침 링크 |
| `frontend/src/app/settings/page.tsx` | 수정 | 계정 카드에 방침 링크 |

링크는 **작은 텍스트 링크**로 단다. 랜딩에서는 CTA와 경쟁하지 않아야 하고, `/settings`에서는
`구독 관리`·`문의·피드백` 같은 실행 버튼이 아니라 `사용 가이드 보기`(`ManualLink`)와 같은
가벼운 취급이 맞다 — 방침은 읽는 문서지 수행하는 액션이 아니다.

### 3.2 백엔드 — 인증 기록 정리

| 파일 | 상태 | 책임 |
|---|---|---|
| `backend/src/modules/user/email-verification-cleanup.cron.ts` | 신규 | 매일 1회 정리 호출 |
| `backend/src/modules/user/email-verification.service.ts` | 수정 | `deleteOlderThan(cutoff)` 추가 |
| `backend/src/modules/user/email-verification.constants.ts` | 수정 | 보관 기간 상수 |
| `backend/src/modules/user/user.module.ts` | 수정 | 크론 provider 등록 |

- **`createdAt`이 7일보다 오래된 행**을 삭제한다(`consumedAt`·`expiresAt`이 아니라 `createdAt`
  기준이다 — rate limit이 보는 컬럼이 `createdAt`이므로 같은 기준을 써야 판단이 어긋나지 않는다).
  24시간 rate-limit 창을 넉넉히 보존한다.
- `@Cron(CronExpression.EVERY_DAY_AT_5AM)` — 구독 갱신 크론(4시)과 시간을 어긋나게 둔다.
  `ScheduleModule.forRoot()`는 `app.module.ts:28`에 이미 있다.
- 삭제 로직은 서비스에 두고 크론은 호출만 한다 — `SubscriptionRenewalCron`과 같은 모양.

## 4. 방침 본문 구성

개인정보 보호법 제30조 기재사항을 채우되 문구는 1절의 실측에 맞춘다.

| 절 | 내용 |
|---|---|
| 1. 처리 목적 | 회원 가입·인증·관리 / 경기 기록·랭킹·능력치 제공 / 문의 응대 / 유료 구독 결제 |
| 2. 처리 항목 | 1절 표 그대로. 카드정보 미보유를 명시 |
| 3. 보유·이용 기간 | 회원 정보는 탈퇴 시 파기. 이메일 인증 이력 7일. **결제 기록은 전자상거래법상 5년** |
| 4. 제3자 제공 | 없음 |
| 5. 처리위탁 | AWS(서버·DB·SES, 서울 리전) / 토스페이먼츠(결제) / Google(GA4) |
| 6. 파기 절차·방법 | DB 레코드 삭제 |
| 7. 정보주체 권리 | 열람·정정·삭제·처리정지. `/inquiry` 또는 보호책임자 이메일로 요청 |
| 8. 안전성 확보조치 | 비밀번호 bcrypt 해시, 인증코드 SHA-256 해시(평문 미저장), 전 구간 HTTPS, role 기반 관리자 접근 통제 |
| 9. 쿠키·자동수집 거부 | GA4 쿠키·기기 식별자·`user_id`(숫자)·페이지 경로. 브라우저 설정으로 차단 가능하며 차단해도 이용에 지장 없음 |
| 10. 보호책임자 | 6절의 값 |
| 11. 권익침해 구제 | 개인정보분쟁조정위원회·개인정보침해신고센터·대검찰청·경찰청 표준 안내 |
| 12. 시행일·변경 고지 | 변경 시 이 페이지에 공지 |

### 이 서비스 고유의 두 절

**팀원(선수) 정보.** 총무가 팀원 이름·등번호를 대신 입력하는 구조라, 입력되는 사람은 가입자가
아니고 동의한 적도 없다. 방침에 두 가지를 명시한다: (a) 총무는 팀원의 동의를 받고 입력할
책임이 있다, (b) 팀원 본인이 `/inquiry`로 삭제를 요청할 수 있다.

**탈퇴 후 남는 것.** 계정은 삭제되지만 그룹·선수·경기 기록은 팀의 공동 기록물로 남고, 문의의
이메일 스냅샷도 답변 이력 때문에 남는다. 의도된 설계이므로 숨기지 않고 그대로 쓴다.

## 5. 검증

- **백엔드**: `pnpm test` 전체 통과(신규 테스트 포함) + `pnpm build`.
  신규 테스트는 7일 경계에서 지워지는 행/남는 행, 그리고 **24시간 내 행이 살아남는지**를
  검증한다(rate limit 회귀 방지).
- **프론트엔드**: `npx next build`에서 `/privacy`가 `○ (Static)`으로 나오는지.
  프론트엔드에는 테스트 러너가 없다(GA·랜딩 작업에서 확정) — `pnpm lint`도 쓰지 않는다.
- **브라우저**: 랜딩 하단·`/settings`에서 방침으로 이동, 375px에서 긴 본문이 가로로 넘치지 않는지.
- **크론**: 로컬에서 7일 이전/이후 행을 넣고 서비스 메서드를 직접 호출해 삭제 동작 확인.

## 6. 구현 전에 채워야 하는 값 ⚠️

**아래 값이 없으면 구현에 들어갈 수 없다.** 방침 본문에 그대로 박히고, 빈칸이 남은 방침은
법적 효력이 없다. 사용자만 아는 값이다.

1. 상호(사업자명)
2. 대표자 성명
3. 사업자등록번호
4. 사업장 주소
5. 개인정보 보호책임자 — 성명, 직책, 연락 이메일
6. 시행일

계획서는 이 값들을 받은 뒤 작성한다. 본문 구조·크론·링크 배치는 값과 무관하므로 이 설계로
확정된 상태다.

## 7. 머지 순서

이 브랜치는 `feature/landing-intro`에서 땄다 — 랜딩 하단에 링크를 걸어야 하는데
`LandingHero.tsx`가 그 브랜치에만 있기 때문이다. 따라서 순서가 고정된다:

**`feature/ga-analytics` → `feature/landing-intro` → `feature/privacy-page`**

`layout.tsx`·`Signup.tsx`는 건드리지 않으므로 GA 브랜치와 코드 충돌은 없다.
`handoff.md`·`docs/featurelist.md`는 세 브랜치가 모두 고치므로 나중에 머지하는 쪽이
텍스트 충돌을 해결한다(랜딩 설계 6절과 같은 상황).

백엔드를 건드리므로 이 브랜치가 머지되면 백엔드 잡도 돈다 — 프론트와 같은 sha로 함께 배포된다.

## 8. 이 작업이 만드는 후속 TODO

- **푸터 신설** — `layout.tsx`에 얇은 푸터를 만들어 방침 링크를 전 페이지에 노출하는 것이
  관례에 맞다. GA 머지 후에 가능하다. 이용약관·사업자정보가 생기면 갈 자리도 된다.
- **가입 폼 동의 문구** — "가입하면 개인정보처리방침에 동의한 것으로 봅니다" + 링크.
  동의 시점이 명확해진다. `Signup.tsx`가 GA 브랜치와 겹쳐 이번엔 뺐다.
- **회원탈퇴 UI** — `DELETE /user/:id`는 있는데 프론트 진입점이 없다. 지금은 문의로 안내한다.
- **이용약관** — 방침과 별개 문서다. 유료 결제가 있으므로 언젠가 필요하다.
