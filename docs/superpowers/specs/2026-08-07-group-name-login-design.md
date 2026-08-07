# 그룹명 로그인 설계

작성일: 2026-08-07

## 배경

로그인이 이메일로만 가능해 불편하다는 요청에서 출발했다. 현재 구조는 다음과 같다.

- `User`: `email`(unique), `password`, `name`(nullable·유니크 아님), `groupId`, `role`
- `Group`: `name`(unique, varchar(20)), `isDeleted`
- 가입(`UserService.createUser`)이 그룹을 생성하는 유일한 실사용 경로다 → **그룹당 계정 1개**
- 로그인은 `POST /user/login { email, password }` 하나뿐

당분간 그룹당 1계정 구조를 유지하기로 했다. 그러면 `Group.name`이 unique이므로 **그룹명만으로 계정이 특정된다.** 최초 아이디어였던 "그룹명 + 닉네임"에서 닉네임은 검증에 기여하는 바가 없고, 오히려 `User.name`이 nullable이라 기존 사용자가 로그인 불가가 된다. 따라서 닉네임은 로그인 입력에서 제외한다.

## 목표

1. 이메일 또는 그룹명 중 편한 쪽으로 로그인할 수 있다.
2. 그룹명을 아이디로 쓰면서 생기는 보안 노출을 함께 막는다.

## 비목표

- 한 그룹에 여러 계정을 두는 구조 (이번 범위 아님)
- 닉네임(`User.name`) 기반 로그인
- 이메일 인증 요청 엔드포인트의 남용 방지 (별도 follow-up)
- 타이밍 공격 방어용 더미 해시 비교 — 이 규모에 과하다고 판단해 **의도적으로 제외**

## 보안 전제

`GET /group/all`은 인증 없이 전체 그룹명을 반환한다(`group.controller.ts`). 그룹명을 아이디로 쓰는 순간 **유효한 아이디 목록이 공개된 상태**가 된다. 여기에 더해 현재:

- 백엔드에 rate limit이 전혀 없다
- 로그인 실패가 404(없는 유저) / 401(틀린 비밀번호)로 갈라져 계정 열거가 가능하다

그룹명 로그인은 이 두 가지를 같이 고치는 것을 전제로 한다.

## 설계

### 1. 아이디 판별

`POST /user/login`은 `{ identifier, password }`를 받는다. **`email` 필드도 계속 수용한다** — 프론트의 `NEXT_PUBLIC_API_URL`이 빌드 타임에 박히는 구조라 캐시된 구버전 번들이 남을 수 있고, 이 저장소는 신구 배포 스큐로 실제 장애를 겪은 적이 있다. 둘 다 없으면 400.

전역 `ValidationPipe`가 `forbidNonWhitelisted`로 동작하므로 두 필드 모두 DTO(`LoginUserDto`)에 선언해야 한다. 현재 컨트롤러는 `@Body('email')`로 개별 추출하고 있어 DTO가 없다 — 이번에 DTO를 도입한다.

판별 순서 (입력은 `trim()` 후 사용):

1. 이메일 형식이면 → `email`로 조회. **찾지 못하면 그룹명으로 한 번 더 조회한다.**
   `Group.name`에 문자 제한이 없어 `@`가 포함된 그룹명이 존재할 수 있다.
2. 이메일 형식이 아니면 → 그룹명으로만 조회.

대소문자는 현행 그대로 정확 일치로 둔다 (`Group.name`의 unique 인덱스가 case-sensitive이고, 이메일 조회도 지금 정확 일치다). 여기서 정규화를 도입하면 기존 동작이 바뀌므로 건드리지 않는다.

### 2. 그룹명 → 계정 조회

기존 `GroupRepository.findByName(name)`을 재사용한다. 이 메서드는 `isDeleted: false`를 조건에 포함하므로 **소프트 삭제된 그룹은 그룹명 로그인이 불가**하다. 해당 계정의 이메일 로그인은 계속 동작한다. 의도된 동작이다.

그룹을 찾으면 해당 `groupId`의 계정을 `id ASC`로 **최대 2건** 조회한다.

- 0건 → 로그인 실패(401)
- 1건 → 그 계정으로 진행
- 2건 이상 → 로그인 실패(401) + `logger.error`. 그룹당 1계정이라는 전제가 깨졌을 때 엉뚱한 계정으로 조용히 로그인되는 것을 막는다.

### 3. 실패 응답 통일

아이디 미존재와 비밀번호 불일치를 모두 아래로 통일한다.

```
401 { message: '아이디 또는 비밀번호가 올바르지 않습니다.' }
```

기존 `404 'User not found'` 경로는 제거한다.

### 4. Rate limit

`@nestjs/throttler`를 추가하고, 전역이 아니라 `/user/login`에만 적용한다.

**추적 키는 IP가 아니라 정규화된 아이디다.** 백엔드가 HTTPS 리버스 프록시 뒤에 있는데 `main.ts`에 `trust proxy` 설정이 없어 `req.ip`가 프록시 IP로 뭉개진다. IP 기준으로 걸면 전체 사용자가 한 버킷을 공유해 정상 사용자까지 차단된다. 아이디 기준은 프록시 구성과 무관하고, 실제 위협(공개된 그룹명 목록에 대한 비밀번호 대입)을 정확히 겨냥한다.

- 한도: **5분당 10회**(아이디 기준), 초과 시 429
- 커스텀 `ThrottlerGuard` 서브클래스에서 `getTracker()`가 요청 바디의 `identifier ?? email`을 `trim()`해 반환한다. 값이 없으면 `req.ip`로 폴백한다.
- 스토리지는 기본 인메모리. 백엔드 단일 인스턴스 전제이고, 재시작 시 카운터가 초기화된다 — 이 규모에서는 충분하다.
- 트레이드오프: 공격자가 특정 그룹의 로그인을 일시적으로 막을 수 있다. 영구 잠금이 아니라 창이 지나면 자동 해제되므로 수용한다.
- **아이디 기준 제한 하나만으로는 부족하다.** 이 제한은 "한 계정에 비밀번호 여러 개"(수직 브루트포스)만 막는다. "여러 계정에 비밀번호 하나씩"(수평 스프레이 — `GET /group/all`로 공개된 그룹명을 전부 긁어 흔한 비밀번호 하나를 각각 1회씩 시도)은 매 시도가 서로 다른 버킷에 떨어져 이 제한을 전혀 건드리지 않는다. 이를 막기 위해 트래커 값과 무관하게 하나의 상수 키로 수렴하는 **굵은 사이트 전역 버킷을 추가로 둔다(5분당 300회)** — 두 스로틀러를 배열로 등록하고, 전역 버킷을 먼저 평가하도록 순서를 앞에 둔다. 구현: `src/modules/user/login-throttler.guard.ts`의 `SITEWIDE_LOGIN_THROTTLER_NAME`/`generateKey()` 오버라이드, `user.module.ts`의 `ThrottlerModule.forRoot([...])` 순서.

### 5. 프론트엔드

`frontend/src/app/components/Login.tsx` 한 파일만 바뀐다.

- state `email` → `identifier`
- `placeholder="아이디"` → `"이메일 또는 그룹명"`
- 입력창 아래에 안내 문구 한 줄 ("그룹명으로도 로그인할 수 있어요")
- 요청 바디 `{ identifier, password }`
- 에러 분기: 401 → 기존 메시지 유지, **404 분기 제거**, 429 → "시도가 너무 많아요. 잠시 후 다시 시도해주세요."
- `autoComplete="username"` 유지

로그인 성공 후 처리(토큰 저장, `useAuthStore`, `groupStore` 자동 선택)는 그대로다.

## 변경 파일

**백엔드**
- `src/modules/user/user.request.dto.ts` — `LoginUserDto` 추가
- `src/modules/user/user.controller.ts` — `@Body(ValidationPipe) dto` 방식으로 변경, 로그인 throttle 가드 적용
- `src/modules/user/user.service.ts` — `loginUser(identifier, password)` 재작성
- `src/modules/user/login-throttler.guard.ts` — 신규 (아이디 기준 tracker)
- `src/modules/user/user.module.ts` — `ThrottlerModule` 등록 (`GroupRepository`는 이미 `UserModule` provider이자 `UserService` 주입 대상이라 추가 배선 불필요)
- `package.json` — `@nestjs/throttler` 추가

**프론트엔드**
- `frontend/src/app/components/Login.tsx`

## 테스트

**백엔드** (`src/modules/user/user-login.spec.ts` 신규)
- 이메일로 로그인 성공 — 토큰 payload에 `userId`/`groupId`/`role` 포함, 응답에 `password` 없음
- 그룹명으로 로그인 성공
- `@`가 포함된 그룹명 — 이메일 조회 실패 후 그룹명으로 폴백해 성공
- 존재하지 않는 아이디 → 401, 메시지가 비밀번호 오류와 동일
- 비밀번호 불일치 → 401
- `isDeleted: true` 그룹의 그룹명 → 401
- 한 그룹에 계정 2개 → 401 + error 로그

**DTO** (`src/modules/user/user-login-dto.spec.ts` 신규)
- `identifier` + `password` 통과 / 레거시 `email` + `password` 통과
- `identifier`·`email` 둘 다 없으면 검증 실패(400)
- `password` 없으면 검증 실패

**가드** (`src/modules/user/login-throttler.guard.spec.ts` 신규)
- `getTracker()`가 바디의 `identifier`를 반환
- `identifier` 부재 시 `email` 사용, 둘 다 없으면 `req.ip` 폴백

**기존 갱신**
- `src/modules/user/user.controller.spec.ts` — 로그인 시그니처 변경 반영

## 배포

- DB 스키마 변경 없음 → 마이그레이션 불필요
- 백엔드가 `email` 필드를 계속 수용하므로 백엔드 선행 배포가 안전하다. 프론트는 그 뒤 아무 때나 나가도 된다.
- CI 헬스체크는 `/group/all`과 프론트 루트만 확인하므로, 배포 후 로그인(이메일·그룹명 양쪽)을 직접 스모크할 것.
- **프론트 먼저·백엔드 실패 스큐 위험.** 백엔드·프론트 CI 잡은 독립적으로 돈다. 백엔드 잡이 실패하고 프론트 잡만 성공하면, 새 프론트 번들이 `{ identifier, password }`를 예전 백엔드로 보내는데 예전 핸들러는 `@Body('email')`만 읽으므로 값이 `undefined`가 되고, TypeORM이 `where` 조건에서 그 항목을 드롭해 사이트 전체 로그인이 401로 실패한다 — 그런데 CI 헬스체크는 `/group/all`만 curl하므로 계속 green으로 보인다. 병합 지침: 백엔드를 먼저 배포해 green을 확인한 뒤 프론트를 내보내거나, 동시 배포가 필요하면 `workflow_dispatch`로 둘 다 강제 빌드한다. 어느 경우든 배포 후 이메일·그룹명 로그인 양쪽을 직접 스모크한다.
