# 문의·피드백 경로 설계

- 날짜: 2026-07-28
- 대상: 신규 `/inquiry` 페이지, `/settings` 진입점, `/admin` 문의 관리 카드
- 상태: 설계 확정

## 배경 / 목표

`docs/featurelist.md`의 "문의, 피드백 받을 경로 추가" 항목을 구현한다.
현재 서비스에는 사용자가 버그를 알리거나 기능을 제안할 경로가 전혀 없다.
앱 안에서 문의를 접수해 DB에 보관하고, 관리자가 `/admin`에서 확인·답변하면
작성자에게 이메일로 회신이 나가는 구조를 만든다.

SES 프로덕션 액세스가 2026-07-27에 승인되어 실발송이 가능해진 것이 이 설계의 전제다.

## 확정된 결정 사항

1. **수신 경로**: 앱 내 폼 → DB 저장 → `/admin`에서 조회. 외부 채널(구글폼·오픈채팅)은 쓰지 않는다.
2. **접근 권한**: 로그인 사용자만. 비로그인 문의는 받지 않는다.
3. **폼 항목**: 유형 + 내용. 제목·스크린샷 첨부는 범위 밖.
4. **진입점**: `/settings` 계정 카드의 버튼. 헤더 네비는 이미 6개로 포화라 건드리지 않는다.
5. **회신 방식**: 관리자가 `/admin`에서 답변을 입력하면 SES로 작성자에게 메일 발송.
6. **데이터 모델**: 단일 `Inquiry` 엔티티에 문의와 답변을 함께 둔다(답변 1회). 대화형 스레드는 범위 밖.

## 데이터 모델

`backend/src/entities/Inquiry.entity.ts` 신규.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | `PrimaryGeneratedColumn` | |
| `user` | `ManyToOne(() => User)`, `createForeignKeyConstraints: false`, `nullable: true` | 작성자 |
| `authorEmail` | `varchar` | 작성 시점 스냅샷. 회신 발송 대상 |
| `type` | `varchar` | `InquiryType` |
| `content` | `text` | 최대 2000자 (DTO에서 강제) |
| `status` | `varchar`, default `'pending'` | `InquiryStatus` |
| `answer` | `text`, nullable | |
| `answeredAt` | `timestamp`, nullable | |
| `createdAt` | `CreateDateColumn` | |
| `updatedAt` | `UpdateDateColumn` | |

`backend/src/modules/inquiry/inquiry.constants.ts`:

```ts
export type InquiryType = 'bug' | 'feature' | 'billing' | 'etc';
export type InquiryStatus = 'pending' | 'answered';
```

`subscription.constants.ts`와 동일하게 문자열 리터럴 유니온으로 둔다(enum 금지).

### FK를 걸지 않는 이유

`UserService.deleteUser`는 하드 삭제(`userRepository.delete(id)`)다.
`user` relation에 FK 제약을 걸면 문의를 남긴 사용자의 탈퇴가 제약 위반으로 실패한다.
`Log.player`·`InGamePlayer.player`가 같은 이유로 `createForeignKeyConstraints: false` +
`nullable: true`를 쓰고 있으므로 그 관행을 따른다. 탈퇴 후에도 문의·답변 이력은 보존된다.

**결과적으로 `inquiry.user`는 `null`일 수 있다. 이 relation을 다루는 모든 코드는 null-safe여야 한다.**

### `authorEmail`을 따로 저장하는 이유

회신 메일은 `user.email`이 아니라 이 스냅샷으로 보낸다. 세 가지를 얻는다:

- `user`가 `null`이 된(탈퇴한) 문의에도 답장할 수 있다
- 문의 당시 어느 주소로 접수됐는지가 이력으로 남는다
- 답변 발송 경로가 relation 로딩에 의존하지 않는다

`authorEmail`은 **클라이언트 입력을 받지 않는다**. 서버가 `req.user`에서 채운다.

## 백엔드 API

신규 모듈 `backend/src/modules/inquiry/`. 사용자용과 관리자용 컨트롤러를 분리하되 한 모듈에 둔다.
`AdminController`는 클래스 전체에 `AdminGuard`가 걸려 있어 사용자 작성 경로를 넣을 수 없고,
문의 로직을 `AdminService`로 옮기면 응집도가 깨지기 때문이다.

| 엔드포인트 | 가드 | 동작 |
|---|---|---|
| `POST /inquiry` | `AuthGuard('jwt')` | `{ type, content }` 접수. `authorEmail`·`user`는 서버가 `req.user`에서 채움 |
| `GET /admin/inquiries` | `AuthGuard('jwt')` + `AdminGuard` | 최신순(`createdAt` DESC) 목록. `status` 쿼리로 선택 필터 |
| `POST /admin/inquiries/:id/answer` | `AuthGuard('jwt')` + `AdminGuard` | `{ answer }` 저장 + 회신 메일 발송 |

관리자 컨트롤러는 `@Controller('admin/inquiries')`로 URL은 기존 `/admin/*` 규칙에 맞추고,
코드는 `inquiry` 모듈에 응집시킨다. `AdminGuard`는 무상태라 `providers`에 등록해 재사용한다.

### 답변 트랜잭션 (핵심)

```
dataSource.transaction(async (manager) => {
  1. Inquiry 조회 — 없으면 NotFoundException
  2. answer / answeredAt / status='answered' 로 UPDATE
  3. mailService.sendInquiryAnswer(authorEmail, ...) 호출
     └ 실패하면 throw → 2번이 롤백되어 status는 pending 유지
})
```

**불변식: `status === 'answered'`이면 회신 메일이 실제로 발송되었다.**

발송이 실패하면 답변이 저장되지 않으므로 관리자는 목록에서 여전히 `pending`인 문의를 보고
다시 답변하면 된다. **재답변은 허용**한다(덮어쓰기 + 메일 재발송). 이것이 곧 재시도 경로다.
재답변 시 `answeredAt`은 마지막 발송 시각으로 갱신한다.
SES 호출이 트랜잭션을 잡고 있는 시간은 예상 문의량 규모에서 문제되지 않는다.

이 설계가 막는 것은 "관리자는 답변했다고 생각하는데 사용자는 받지 못한" 조용한 실패다.

### `MailService` 정리

현재 SES 클라이언트 생성과 `MAIL_FROM` 폴백이 `sendVerificationCode` 안에 묻혀 있다.
이를 private `send(to, subject, body)`로 추출하고 `sendVerificationCode`와
신규 `sendInquiryAnswer`가 공유하게 한다. 메일 본문은 기존 `buildVerificationMail`처럼
순수 함수 `buildInquiryAnswerMail(type, content, answer)`로 분리해 테스트 가능하게 둔다.

회신 메일 본문에는 **원문 문의 내용을 함께 싣는다**. 작성자가 무엇에 대한 답변인지
메일만 보고 알 수 있어야 하기 때문이다. 제목은 `[dn.gg] 문의하신 내용에 답변드립니다`로 한다.

`MAIL_FROM` 미설정 시 로그 폴백(dev)은 기존 동작을 유지한다 — dev에서는 발송 실패로 보지 않는다.

### 입력 검증

`backend/src/modules/inquiry/inquiry.request.dto.ts`:

- `CreateInquiryDto.type` — `@IsIn(['bug','feature','billing','etc'])`
- `CreateInquiryDto.content` — `@IsNotEmpty()` + `@MaxLength(2000)`
- `AnswerInquiryDto.answer` — `@IsNotEmpty()` + `@MaxLength(5000)`
- `ListInquiryQueryDto.status` — `@IsOptional()` + `@IsIn(['pending','answered'])`.
  쿼리 파라미터도 전역 `ValidationPipe`를 타므로 DTO가 없으면 임의 값이 그대로 `where`에 들어간다.

전역 `ValidationPipe`가 `whitelist` + `forbidNonWhitelisted`이므로 DTO에 없는 필드는 자동 거부된다.
특히 `authorEmail`·`status`를 클라이언트가 밀어넣으려는 시도는 여기서 차단된다.

### 응답 형태

- `POST /inquiry` → `{ id, createdAt }` 정도만. 작성자 정보 에코백 없음.
- `GET /admin/inquiries` → `{ id, type, content, authorEmail, status, answer, answeredAt, createdAt }[]`
  (관리자 전용이므로 `authorEmail` 노출 가능)

## 프론트엔드

### ① 문의 폼 — `frontend/src/app/inquiry/page.tsx`

유형 `<select>` + 내용 `<textarea>`(2000자 카운터) + 전송 버튼.
스타일은 `settings/page.tsx`처럼 파일 안 styled-components로 두고 기존 카드 톤을 따른다.
`useMounted`로 hydration 불일치를 막는다.
비로그인 직접 접근 시 토스트 후 `/settings`로 보낸다(헤더 `handleLockedMenuClick`과 동일 처리).
전송 성공 시 `setPendingToast`로 안내를 걸고 `/settings`로 복귀한다.

API 호출은 `@/lib/axios`의 `api`를 쓴다(`src/app/lib/axios.ts`는 레거시 — 사용 금지).

### ② 진입점 — `frontend/src/app/settings/page.tsx`

`구독 관리` 버튼 아래에 `문의·피드백` 버튼을 추가한다.
이 영역은 `user`가 있을 때만 렌더되므로 로그인 가드가 자동으로 걸린다.
기존 `SubscriptionButton` 스타일을 재사용한다.

### ③ 관리자 — `frontend/src/app/admin/page.tsx`

`문의` `S.Card`를 추가한다. 테이블 컬럼: 접수일 / 유형 / 작성자 이메일 / 내용(말줄임) / 상태 / 액션.
`pending`은 `S.Badge $tone="warn"`, `answered`는 `$tone="ok"`로 기존 톤을 그대로 쓴다.
행의 `답변` 버튼을 누르면 **그 행 아래가 인라인으로 펼쳐져** textarea + 전송 버튼이 나온다(모달 미도입).
전송은 `useMutation` → 성공 시 목록 `invalidateQueries`.

## 에러 처리

- 폼 전송 실패 → `showToast("문의 전송에 실패했습니다. 잠시 후 다시 시도해주세요.", "error")`
- 401 → `@/lib/axios` 인터셉터가 이미 처리(로그아웃 → `/settings` 리다이렉트)
- **답변 메일 발송 실패** → 백엔드가 롤백하고 에러를 반환. 관리자 화면은
  `"답변 메일 발송에 실패했습니다. 다시 시도해주세요."`를 띄우고 해당 문의는 `pending`으로 남는다.
  성공한 척하지 않는 것이 요점이다.
- 백엔드는 전역 `HttpExceptionFilter`를 그대로 탄다. SES 원본 에러 메시지는 응답에 싣지 않는다.

## 테스트 계획

`backend/`, jest. 기존 spec 파일 패턴을 따른다.

`inquiry.service.spec.ts`:
- 접수 시 `authorEmail`이 클라이언트 입력이 아니라 `req.user`에서 채워진다
- 답변 성공 시 `status='answered'`, `answeredAt` 기록, 메일 1회 발송
- **메일 발송이 실패하면 롤백되어 `status`가 `pending`으로 남는다** ← 핵심 케이스
- 존재하지 않는 id면 `NotFoundException`
- `user`가 `null`인(탈퇴한) 문의도 `authorEmail`로 답변이 나간다
- 이미 `answered`인 문의에 재답변하면 덮어쓰고 메일이 다시 나간다

`inquiry.request.dto.spec.ts` (`log.request.dto.spec.ts` 패턴):
- 잘못된 `type` 거부, 빈 `content` 거부, 2000자 초과 거부

`mail.service.spec.ts` (기존 파일에 추가):
- `buildInquiryAnswerMail` 제목·본문
- `send` 추출 후에도 `sendVerificationCode` 기존 동작이 유지된다

프론트는 이 프로젝트에 테스트 인프라가 없어 단위 테스트를 새로 도입하지 않고, 배포 후 수동 스모크로 확인한다.

## 파일 목록

신규:
- `backend/src/entities/Inquiry.entity.ts`
- `backend/src/modules/inquiry/inquiry.constants.ts`
- `backend/src/modules/inquiry/inquiry.module.ts`
- `backend/src/modules/inquiry/inquiry.controller.ts`
- `backend/src/modules/inquiry/inquiry-admin.controller.ts`
- `backend/src/modules/inquiry/inquiry.service.ts`
- `backend/src/modules/inquiry/inquiry.request.dto.ts`
- `backend/src/modules/inquiry/inquiry.service.spec.ts`
- `backend/src/modules/inquiry/inquiry.request.dto.spec.ts`
- `frontend/src/app/inquiry/page.tsx`

수정:
- `backend/src/app.module.ts` — `InquiryModule` 등록
- `backend/src/modules/mail/mail.service.ts` — `send` 추출 + `sendInquiryAnswer` 추가
- `backend/src/modules/mail/mail.service.spec.ts` — 케이스 추가
- `frontend/src/app/settings/page.tsx` — 진입 버튼
- `frontend/src/app/admin/page.tsx` — 문의 카드
- 관리자 문의 카드는 기존 `S.Card`·`S.Table`·`S.Badge`·`S.SmallButton`을 재사용한다.
  인라인 답변 영역(textarea + 전송 버튼)용 스타일만 admin 스타일 파일에 새로 추가한다.
- `docs/featurelist.md` — 항목 완료 처리

## 범위 밖 (YAGNI)

- 대화형 스레드(`InquiryReply` 테이블) — 사용자가 앱에서 답변에 재응답할 경로가 없다. 필요해지면 `Inquiry`를 건드리지 않고 나중에 추가할 수 있다.
- 앱 내 "내 문의 내역" 화면
- 스크린샷·파일 첨부 (S3 등 저장소 구성 필요)
- 비로그인 문의 및 그에 따른 스팸 방지(레이트 리밋·캡차)
- 문의 알림 푸시/슬랙 연동

## 배포 주의

- 백엔드·프론트가 함께 가야 한다(신규 API + 신규 페이지). CI에서 두 잡이 같은 sha로 배포되는지 확인할 것.
- `synchronize: true`이므로 `Inquiry` 테이블은 백엔드 재시작 시 자동 생성된다. 별도 마이그레이션 실행 불필요.
- CI 헬스체크는 기존 라우트만 확인한다. 배포 후 `POST /inquiry`와 `/admin/inquiries`를 직접 스모크할 것.
