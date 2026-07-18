# 회원가입 프로세스 개선 설계 (구독 결제 도입 후속)

- 작성일: 2026-07-17
- 상태: 승인됨
- 배경: 토스페이먼츠 빌링키 정기결제(그룹 단위, 월 9,900원/연 99,000원)가 도입되면서 이메일이 결제 영수증·계정 복구의 핵심 수단이 됐다. 현재 회원가입은 이메일 형식 검증조차 없이 즉시 가입되고, 비밀번호 분실 시 복구 수단이 없으며, 전화번호는 하드코딩 키+고정 IV의 깨진 암호화로 저장만 되고 쓰임새가 없다.

## 결정 사항 요약

| 항목 | 결정 |
|---|---|
| 본인 인증 수준 | 이메일 인증만 (실명인증·SMS 없음 — 결제 시 토스 카드 인증이 사실상 본인확인 역할) |
| 인증 흐름 | 가입 전 6자리 코드 인증 (미인증 계정이 생성되지 않음) |
| 필수 정보 | 이메일 · 비밀번호(8자 이상) · 이름(1~30자) · 그룹명. 전화번호는 폼과 컬럼에서 제거 |
| 메일 인프라 | AWS SES (EC2 IAM Role 자격증명, dev는 콘솔 로그 폴백) |
| 상태 저장 | Postgres `EmailVerification` 테이블 (Redis 미도입) |
| 범위 | 가입 개선 + 이메일 기반 비밀번호 재설정 포함 |

## 1. 데이터 모델

### User 엔티티 변경 (`backend/src/entities/User.entity.ts`)

- `name: varchar(30)` 추가. **컬럼은 nullable** — 기존 유저가 있기 때문. 신규 가입 DTO에서는 필수. 기존 유저는 설정 페이지에서 입력할 수 있다.
- `phoneNumber` 컬럼 제거. `synchronize: true`이므로 백엔드 재시작 시 운영 DB에서 컬럼이 drop되어 기존 전화번호 데이터가 삭제된다. 깨진 암호화로 저장된 데이터라 복구 가치가 없음을 확인하고 **사용자 승인 완료** (2026-07-17).
- 사용처가 사라지는 `backend/src/utils/crypto.util.ts`는 삭제한다.
- `emailVerified` 플래그는 추가하지 않는다. 가입 전 인증 방식이라 가입된 유저는 전원 인증 완료이고, 기존 유저는 인증된 것으로 간주한다.

### EmailVerification 엔티티 신설 (`backend/src/entities/EmailVerification.entity.ts`)

| 컬럼 | 타입 | 용도 |
|---|---|---|
| `id` | PK | |
| `email` | varchar | 대상 이메일 |
| `purpose` | varchar | `'signup'` \| `'password_reset'` |
| `codeHash` | varchar | 6자리 코드의 SHA-256 해시 (평문 저장 금지) |
| `expiresAt` | timestamp | 발송 시각 + 10분 |
| `attemptCount` | int | confirm 시도 횟수. 5회 초과 시 해당 코드 무효 |
| `verifiedAt` | timestamp nullable | 코드 확인 성공 시각 |
| `consumedAt` | timestamp nullable | 최종 사용(가입 완료·비밀번호 변경) 시각 |
| `createdAt` | timestamp | 쿨다운·일일 한도 계산 기준 |

- 인덱스: `(email, purpose)`.
- 재발송 쿨다운 60초, 일일 발송 한도 이메일당 10회 — 이 테이블의 `createdAt` 카운트로 제어한다.

## 2. 가입 플로우 (백엔드 — user 모듈 확장)

```
① POST /user/email-verification/request   { email, purpose: 'signup' }
   - 이미 가입된 이메일 → 409
   - 쿨다운(60초)/일일 한도(10회) 위반 → 429
   - 코드 생성 → SHA-256 해시 저장 → SES 발송

② POST /user/email-verification/confirm   { email, code, purpose }
   - 만료/시도 초과/불일치 → 4xx (attemptCount 증가)
   - 성공 → verifiedAt 기록, 단기 verificationToken 반환
     (JWT, 15분, payload: { email, purpose })

③ POST /user   { email, password, name, groupName, verificationToken }
   - 토큰 검증: 서명·만료·email 일치·purpose === 'signup'·consumedAt null
   - 통과 시 기존 가입 로직(트랜잭션: Group 생성 → User 생성) 수행
   - 성공 시 consumedAt 기록
```

- 가입 API가 verificationToken을 요구하므로 인증을 우회한 가입은 불가능하다.
- DTO 변경 (`user.request.dto.ts`): `@IsEmail`, 비밀번호 `@MinLength(8)`, `name` `@Length(1, 30)` 추가, `phoneNumber` 제거. 전역 ValidationPipe(whitelist + forbidNonWhitelisted) 때문에 새 필드는 반드시 DTO에 선언한다.

## 3. 비밀번호 재설정

- ①②는 동일 엔드포인트를 `purpose: 'password_reset'`으로 재사용.
- request 시 **이메일 존재 여부를 응답으로 노출하지 않는다** — 미가입 이메일이어도 200을 반환하고 발송만 생략 (계정 존재 탐색 방지).
- confirm 후 `POST /user/password-reset { verificationToken, newPassword }` → bcrypt(salt rounds 10) 재해시 저장, consumedAt 기록.
- 알려진 한계: stateless JWT 구조상 비밀번호 변경 시 기발급 accessToken의 강제 만료는 불가. 이번 범위에서 제외한다.

## 4. 메일 모듈 (`backend/src/modules/mail/`)

- `MailService` — `@aws-sdk/client-ses`의 `SendEmailCommand` 사용. 템플릿은 코드 내 함수 2종(가입 인증 코드, 비밀번호 재설정 코드).
- 환경 변수: `MAIL_FROM`(예: `no-reply@dngg.one`), `AWS_REGION`. 운영 자격증명은 EC2 IAM Role, 로컬은 env.
- dev 폴백: SES 미설정 시 발송 대신 코드를 콘솔 로그로 출력해 로컬 개발이 SES 없이 동작한다.
- 코드 외 사전 작업: SES에서 dngg.one 도메인 인증(DKIM/SPF), 샌드박스 해제 신청.

## 5. 프론트엔드

- **Signup.tsx 개편** — 한 화면 내 3단계 전환:
  1. 이메일 입력 → "인증코드 발송"
  2. 코드 입력 (10분 만료 타이머, 60초 후 재발송 버튼)
  3. 이름 · 비밀번호 · 비밀번호 확인 · 그룹명 입력 → 가입 (verificationToken 동봉)
- **Login.tsx** — "비밀번호를 잊으셨나요?" 링크 → 이메일 → 코드 → 새 비밀번호 3단계 UI (인증 단계 컴포넌트는 가입과 공유).
- **설정 페이지** — 계정 정보에 이름 표시. 이름 없는 기존 유저는 입력·저장 가능 (`PUT /user/:id` 재사용, update DTO에 name 추가).
- 토스트는 기존 `toastBus`, 스타일은 기존 `styles/*.ts` 패턴, API 호출은 `@/lib/axios`.

## 6. 테스트

- `email-verification.service.spec.ts` — 코드 발급 / 만료 / 시도 초과 / 쿨다운 / 일일 한도 / 토큰 발급·검증.
- `user.service.spec.ts` 갱신 — verificationToken 없는(또는 위조된) 가입 거부, 비밀번호 재설정 성공·실패 케이스.
- `MailService`는 spec에서 mock 처리 (실발송 없음). 기존 subscription 모듈 spec 패턴을 따른다.

## 범위 밖 (명시적 제외)

- SMS/실명 본인인증, 소셜 로그인
- refresh token, 토큰 블랙리스트(비밀번호 변경 시 세션 강제 만료)
- 이메일 변경 기능
- IP 기반 레이트리밋
