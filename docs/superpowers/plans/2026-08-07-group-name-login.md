# 그룹명 로그인 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이메일뿐 아니라 그룹명으로도 로그인할 수 있게 하고, 그로 인해 넓어지는 공격 표면(공개된 그룹명 목록·계정 열거·무제한 시도)을 함께 막는다.

**Architecture:** `POST /user/login`이 `identifier`(이메일 또는 그룹명)를 받는다. 서비스가 입력을 보고 이메일 조회 → 실패 시 그룹명 조회 순으로 계정을 찾는다. 그룹명 조회는 기존 `GroupRepository.findByName`(소프트 삭제 그룹 제외)을 재사용하고, 그룹당 계정이 2개 이상이면 로그인을 거부한다. 실패 응답은 401 하나로 통일하고, `/user/login`에만 아이디 기준 rate limit을 건다.

**Tech Stack:** NestJS 11, TypeORM, class-validator, `@nestjs/throttler` 6.5.0(신규), Jest, Next.js 14 + styled-components

**설계 문서:** `docs/superpowers/specs/2026-08-07-group-name-login-design.md`

## Global Constraints

- 패키지 매니저는 **pnpm**. 명령은 `backend/` 또는 `frontend/` 안에서 실행한다.
- 커밋 메시지 제목·본문은 **한글**, conventional commit 타입 접두어는 영문(`feat:`, `fix:`, `test:`, `chore:`).
- `pnpm lint`는 `eslint --fix`로 **저장소 전체를 수정**한다. 이 작업에서는 항상 경로를 좁혀 실행할 것: `npx eslint src/modules/user --ext .ts`.
- 백엔드 테스트는 `pnpm test -- <경로>` 형태로 단일 파일 실행. 테스트 파일은 `*.spec.ts`이며 `rootDir`는 `src`다.
- 전역 `ValidationPipe`가 `whitelist` + `forbidNonWhitelisted`로 동작한다 — **DTO에 선언되지 않은 요청 프로퍼티는 400으로 거부된다.** 새 요청 필드는 반드시 DTO에 넣을 것.
- **DB 스키마 변경 없음.** 엔티티를 건드리지 말 것 (`synchronize: true`라 엔티티 수정이 즉시 실 DB에 반영된다).
- `main`에 푸시하면 즉시 운영 배포된다. 이 계획의 모든 커밋은 **로컬 커밋만** 하고 푸시하지 않는다.
- 실패 메시지 문자열은 정확히 `아이디 또는 비밀번호가 올바르지 않습니다.` (프론트 기존 토스트와 동일 문구)

## File Structure

**백엔드 (`backend/`)**

| 파일 | 책임 |
|---|---|
| `src/modules/user/user.service.ts` (수정) | `loginUser` 재작성 — 아이디 판별, 그룹명→계정 조회, 401 통일 |
| `src/modules/user/user.request.dto.ts` (수정) | `LoginUserDto` 추가 (`identifier` / 레거시 `email` / `password`) |
| `src/modules/user/user.controller.ts` (수정) | 로그인 바디를 DTO로 받고, throttle 가드 부착 |
| `src/modules/user/login-throttler.guard.ts` (신규) | 아이디 기준 tracker + `ThrottlerGuard` 서브클래스 |
| `src/modules/user/user.module.ts` (수정) | `ThrottlerModule.forRoot` 등록, 가드 provider 등록 |
| `src/modules/user/user-login.spec.ts` (신규) | 로그인 서비스 동작 전체 |
| `src/modules/user/login-throttler.guard.spec.ts` (신규) | tracker 결정 로직 |
| `src/modules/user/user.controller.spec.ts` (수정) | 로그인 컨트롤러 배선 |

`GroupRepository`는 이미 `UserModule`의 provider이고 `UserService` 생성자에 주입되어 있다 — 추가 배선이 필요 없다.

**프론트엔드 (`frontend/`)**

| 파일 | 책임 |
|---|---|
| `src/app/components/Login.tsx` (수정) | 입력 라벨/상태 `identifier`화, 안내 문구, 429 분기 |

프론트엔드에는 테스트 러너가 없다. 검증은 `pnpm build` + 수동 확인으로 한다.

---

### Task 1: 로그인 실패 응답을 401로 통일

지금은 계정이 없으면 404 `User not found`, 비밀번호가 틀리면 401이라 **아이디 존재 여부가 그대로 노출된다.** 그룹명을 아이디로 쓰기 전에 먼저 막는다. 이 태스크에서 파라미터 이름도 `email` → `identifier`로 바꿔 두어 다음 태스크가 시그니처를 다시 건드리지 않게 한다.

**Files:**
- Modify: `backend/src/modules/user/user.service.ts` (`loginUser`, 파일 상단 `typedBcrypt`)
- Modify: `backend/src/modules/user/user.controller.ts:78-84` (인자 이름만)
- Test: `backend/src/modules/user/user-login.spec.ts` (신규)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `UserService.loginUser(identifier: string, password: string): Promise<{ user: Omit<User, 'password'>; accessToken: string }>`
  - `INVALID_CREDENTIALS_MESSAGE` — `user.service.ts`에서 export하는 상수

- [ ] **Step 1: 실패 테스트 작성**

`backend/src/modules/user/user-login.spec.ts` 생성:

```ts
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import {
  INVALID_CREDENTIALS_MESSAGE,
  UserService,
} from './user.service';
import { User } from '../../entities/User.entity';
import { GroupRepository } from '../../repository/group.repository';
import { EmailVerificationService } from './email-verification.service';

const PASSWORD = 'password123';
let hashedPassword: string;

// 실제 bcrypt 해시로 검증한다. 라운드는 테스트 속도를 위해 4로 낮춘다
// (compare는 해시에 박힌 라운드를 읽으므로 검증에는 영향이 없다).
beforeAll(async () => {
  hashedPassword = await bcrypt.hash(PASSWORD, 4);
});

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 1,
    groupId: 10,
    email: 'captain@dngg.one',
    password: hashedPassword,
    name: '홍길동',
    createdAt: new Date(),
    role: 'user',
    ...overrides,
  }) as User;

const buildService = (
  options: {
    userFindOne?: jest.Mock;
    userFind?: jest.Mock;
    findByName?: jest.Mock;
  } = {},
) => {
  const userRepository = {
    findOne: options.userFindOne ?? jest.fn().mockResolvedValue(null),
    find: options.userFind ?? jest.fn().mockResolvedValue([]),
  };
  const groupRepository = {
    findByName: options.findByName ?? jest.fn().mockResolvedValue(null),
  };
  const jwtService = { sign: jest.fn().mockReturnValue('signed-token') };
  const service = new UserService(
    userRepository as unknown as Repository<User>,
    groupRepository as unknown as GroupRepository,
    {} as unknown as DataSource,
    jwtService as unknown as JwtService,
    {} as unknown as EmailVerificationService,
  );
  return { service, userRepository, groupRepository, jwtService };
};

describe('loginUser — 이메일 로그인', () => {
  test('이메일과 비밀번호가 맞으면 토큰과 비밀번호 없는 유저를 돌려준다', async () => {
    const user = makeUser();
    const { service, jwtService } = buildService({
      userFindOne: jest.fn().mockResolvedValue(user),
    });

    const result = await service.loginUser('captain@dngg.one', PASSWORD);

    expect(result.accessToken).toBe('signed-token');
    expect(jwtService.sign).toHaveBeenCalledWith({
      userId: 1,
      email: 'captain@dngg.one',
      groupId: 10,
      role: 'user',
    });
    expect(result.user).not.toHaveProperty('password');
  });

  test('앞뒤 공백은 제거하고 조회한다', async () => {
    const userFindOne = jest.fn().mockResolvedValue(makeUser());
    const { service } = buildService({ userFindOne });

    await service.loginUser('  captain@dngg.one  ', PASSWORD);

    expect(userFindOne).toHaveBeenCalledWith({
      where: { email: 'captain@dngg.one' },
    });
  });
});

describe('loginUser — 실패 응답', () => {
  test('없는 아이디는 401을 던진다', async () => {
    const { service } = buildService();

    await expect(
      service.loginUser('nobody@dngg.one', PASSWORD),
    ).rejects.toMatchObject({
      status: 401,
      message: INVALID_CREDENTIALS_MESSAGE,
    });
  });

  test('비밀번호가 틀리면 없는 아이디와 완전히 같은 응답을 준다', async () => {
    const { service } = buildService({
      userFindOne: jest.fn().mockResolvedValue(makeUser()),
    });

    await expect(
      service.loginUser('captain@dngg.one', 'wrong-password'),
    ).rejects.toMatchObject({
      status: 401,
      message: INVALID_CREDENTIALS_MESSAGE,
    });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
cd backend && pnpm test -- src/modules/user/user-login.spec.ts
```

Expected: FAIL — `INVALID_CREDENTIALS_MESSAGE`가 `user.service.ts`에 없어 컴파일 에러

- [ ] **Step 3: 구현**

`backend/src/modules/user/user.service.ts` 상단의 `typedBcrypt`에 `compare`를 추가한다:

```ts
const typedBcrypt = bcrypt as unknown as {
  hash: (data: string, saltOrRounds: number) => Promise<string>;
  compare: (data: string, encrypted: string) => Promise<boolean>;
};
```

같은 파일 상단(`typedBcrypt` 아래)에 상수를 추가한다:

```ts
// 아이디 미존재와 비밀번호 불일치를 구분해서 알려주면 계정 열거가 가능해진다.
// 그룹명은 GET /group/all로 공개되어 있어 특히 위험하므로 응답을 하나로 통일한다.
export const INVALID_CREDENTIALS_MESSAGE =
  '아이디 또는 비밀번호가 올바르지 않습니다.';
```

`loginUser`를 아래로 교체한다 (기존 `user.service.ts:142-162`):

```ts
  async loginUser(
    identifier: string,
    password: string,
  ): Promise<{ user: Omit<User, 'password'>; accessToken: string }> {
    const trimmed = identifier.trim();
    const user = await this.userRepository.findOne({
      where: { email: trimmed },
    });
    if (!user) {
      throw new HttpException(
        INVALID_CREDENTIALS_MESSAGE,
        HttpStatus.UNAUTHORIZED,
      );
    }
    const isMatch = await typedBcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new HttpException(
        INVALID_CREDENTIALS_MESSAGE,
        HttpStatus.UNAUTHORIZED,
      );
    }
    const payload = {
      userId: user.id,
      email: user.email,
      groupId: user.groupId,
      role: user.role,
    };
    const accessToken = this.jwtService.sign(payload);
    return { user: this.omitPassword(user), accessToken };
  }
```

`backend/src/modules/user/user.controller.ts:78-84`의 인자 이름을 맞춘다 (바디 키는 이번 태스크에서 그대로 `email`):

```ts
  @Post('login')
  async loginUser(
    @Body('email') identifier: string,
    @Body('password') password: string,
  ) {
    return this.userService.loginUser(identifier, password);
  }
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd backend && pnpm test -- src/modules/user/user-login.spec.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: 기존 테스트 회귀 확인**

```bash
cd backend && pnpm test
```

Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
cd /Users/onady/project/dngg
git add backend/src/modules/user/user.service.ts backend/src/modules/user/user.controller.ts backend/src/modules/user/user-login.spec.ts
git commit -m "fix: 로그인 실패 응답을 401로 통일해 계정 열거를 막음"
```

---

### Task 2: 그룹명으로 계정 찾기

이메일 조회가 실패하면 그룹명으로 계정을 찾는다. 그룹 조회는 `GroupRepository.findByName`을 쓰는데, 이 메서드가 `isDeleted: false`를 조건에 포함하므로 소프트 삭제된 그룹은 자동으로 걸러진다. 그룹당 계정이 2개 이상이면 엉뚱한 계정으로 조용히 로그인되는 것을 막기 위해 거부한다.

**Files:**
- Modify: `backend/src/modules/user/user.service.ts` (`loginUser` + private 헬퍼 2개)
- Test: `backend/src/modules/user/user-login.spec.ts` (테스트 추가)

**Interfaces:**
- Consumes: Task 1의 `UserService.loginUser(identifier, password)`, `INVALID_CREDENTIALS_MESSAGE`
- Produces: 공개 시그니처 변화 없음. 내부 private 메서드 `findUserByIdentifier`, `findUserByGroupName`

- [ ] **Step 1: 실패 테스트 작성**

`backend/src/modules/user/user-login.spec.ts` 맨 아래에 추가한다 (`makeUser`/`buildService`/`PASSWORD`/`hashedPassword`는 Task 1에서 만든 것을 그대로 쓴다). 파일 상단 import에 `Group`을 추가한다:

```ts
import { Group } from '../../entities/Group.entity';
```

```ts
const makeGroup = (overrides: Partial<Group> = {}): Group =>
  ({
    id: 10,
    name: '월요농구',
    isDeleted: false,
    freeGamesUsed: 0,
    customerKey: null,
    ...overrides,
  }) as unknown as Group;

describe('loginUser — 그룹명 로그인', () => {
  test('그룹명으로 그 그룹의 계정에 로그인한다', async () => {
    const user = makeUser();
    const findByName = jest.fn().mockResolvedValue(makeGroup());
    const userFind = jest.fn().mockResolvedValue([user]);
    const { service } = buildService({ findByName, userFind });

    const result = await service.loginUser('월요농구', PASSWORD);

    expect(findByName).toHaveBeenCalledWith('월요농구');
    expect(userFind).toHaveBeenCalledWith({
      where: { groupId: 10 },
      order: { id: 'ASC' },
      take: 2,
    });
    expect(result.accessToken).toBe('signed-token');
  });

  test('그룹명이면 이메일 조회를 시도하지 않는다', async () => {
    const userFindOne = jest.fn().mockResolvedValue(null);
    const findByName = jest.fn().mockResolvedValue(makeGroup());
    const userFind = jest.fn().mockResolvedValue([makeUser()]);
    const { service } = buildService({ userFindOne, findByName, userFind });

    await service.loginUser('월요농구', PASSWORD);

    expect(userFindOne).not.toHaveBeenCalled();
  });

  test('@가 들어간 그룹명은 이메일 조회 실패 후 그룹명으로 폴백한다', async () => {
    const userFindOne = jest.fn().mockResolvedValue(null);
    const findByName = jest.fn().mockResolvedValue(makeGroup({ name: 'a@b.co' }));
    const userFind = jest.fn().mockResolvedValue([makeUser()]);
    const { service } = buildService({ userFindOne, findByName, userFind });

    const result = await service.loginUser('a@b.co', PASSWORD);

    expect(userFindOne).toHaveBeenCalledWith({ where: { email: 'a@b.co' } });
    expect(findByName).toHaveBeenCalledWith('a@b.co');
    expect(result.accessToken).toBe('signed-token');
  });

  // findByName은 isDeleted: false를 조건에 포함한다 — 삭제된 그룹은 null로 돌아온다.
  test('삭제됐거나 없는 그룹명은 401', async () => {
    const findByName = jest.fn().mockResolvedValue(null);
    const { service } = buildService({ findByName });

    await expect(service.loginUser('없는그룹', PASSWORD)).rejects.toMatchObject({
      status: 401,
      message: INVALID_CREDENTIALS_MESSAGE,
    });
  });

  test('그룹은 있는데 계정이 없으면 401', async () => {
    const findByName = jest.fn().mockResolvedValue(makeGroup());
    const userFind = jest.fn().mockResolvedValue([]);
    const { service } = buildService({ findByName, userFind });

    await expect(service.loginUser('월요농구', PASSWORD)).rejects.toMatchObject({
      status: 401,
    });
  });

  test('한 그룹에 계정이 2개 이상이면 로그인을 거부하고 에러 로그를 남긴다', async () => {
    const findByName = jest.fn().mockResolvedValue(makeGroup());
    const userFind = jest
      .fn()
      .mockResolvedValue([makeUser(), makeUser({ id: 2 })]);
    const { service } = buildService({ findByName, userFind });
    const errorLog = jest
      .spyOn(
        (service as unknown as { logger: { error: (m: string) => void } })
          .logger,
        'error',
      )
      .mockImplementation(() => undefined);

    await expect(service.loginUser('월요농구', PASSWORD)).rejects.toMatchObject({
      status: 401,
    });
    expect(errorLog).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
cd backend && pnpm test -- src/modules/user/user-login.spec.ts
```

Expected: 그룹명 관련 6개 FAIL (그룹명이 이메일로 조회되어 401), Task 1 테스트는 계속 PASS

- [ ] **Step 3: 구현**

`backend/src/modules/user/user.service.ts` 상단 import에 `isEmail`을 추가한다:

```ts
import { isEmail } from 'class-validator';
```

`loginUser`의 계정 조회 부분을 헬퍼 호출로 바꾼다:

```ts
  async loginUser(
    identifier: string,
    password: string,
  ): Promise<{ user: Omit<User, 'password'>; accessToken: string }> {
    const user = await this.findUserByIdentifier(identifier.trim());
    if (!user) {
      throw new HttpException(
        INVALID_CREDENTIALS_MESSAGE,
        HttpStatus.UNAUTHORIZED,
      );
    }
    const isMatch = await typedBcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new HttpException(
        INVALID_CREDENTIALS_MESSAGE,
        HttpStatus.UNAUTHORIZED,
      );
    }
    const payload = {
      userId: user.id,
      email: user.email,
      groupId: user.groupId,
      role: user.role,
    };
    const accessToken = this.jwtService.sign(payload);
    return { user: this.omitPassword(user), accessToken };
  }

  // 아이디는 이메일 또는 그룹명이다. 이메일 형식이어도 그룹명일 수 있으므로
  // (Group.name에 문자 제한이 없어 '@'가 들어갈 수 있다) 못 찾으면 그룹명으로 폴백한다.
  private async findUserByIdentifier(identifier: string): Promise<User | null> {
    if (isEmail(identifier)) {
      const byEmail = await this.userRepository.findOne({
        where: { email: identifier },
      });
      if (byEmail) return byEmail;
    }
    return this.findUserByGroupName(identifier);
  }

  // findByName이 isDeleted: false를 걸러주므로 탈퇴한 그룹명으로는 로그인되지 않는다
  // (해당 계정의 이메일 로그인은 계속 동작한다).
  private async findUserByGroupName(name: string): Promise<User | null> {
    const group = await this.groupRepository.findByName(name);
    if (!group) return null;
    // 가입이 그룹을 만드는 유일한 경로라 그룹당 계정은 1개다. 그 전제가 깨졌을 때
    // 엉뚱한 계정으로 조용히 로그인되지 않도록, 2건 이상이면 거부한다.
    const users = await this.userRepository.find({
      where: { groupId: group.id },
      order: { id: 'ASC' },
      take: 2,
    });
    if (users.length !== 1) {
      if (users.length > 1) {
        this.logger.error(
          `그룹 ${group.id}(${group.name})에 계정이 2개 이상이라 그룹명 로그인을 거부했습니다.`,
        );
      }
      return null;
    }
    return users[0];
  }
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd backend && pnpm test -- src/modules/user/user-login.spec.ts
```

Expected: PASS (10 tests)

- [ ] **Step 5: 린트**

```bash
cd backend && npx eslint src/modules/user --ext .ts
```

Expected: 에러 없음

- [ ] **Step 6: 커밋**

```bash
cd /Users/onady/project/dngg
git add backend/src/modules/user/user.service.ts backend/src/modules/user/user-login.spec.ts
git commit -m "feat: 그룹명으로도 계정을 찾을 수 있게 로그인 조회 확장"
```

---

### Task 3: 요청 DTO와 컨트롤러 배선

바디 키를 `identifier`로 바꾸되 레거시 `email`도 계속 받는다. 프론트의 `NEXT_PUBLIC_API_URL`은 빌드 시점에 박히고 캐시된 구버전 번들이 남을 수 있어, 백엔드를 먼저 배포해도 안전해야 한다. 전역 `ValidationPipe`가 `forbidNonWhitelisted`라 두 키 모두 DTO에 선언해야 한다.

**Files:**
- Modify: `backend/src/modules/user/user.request.dto.ts` (`LoginUserDto` 추가)
- Modify: `backend/src/modules/user/user.controller.ts:78-84`
- Test: `backend/src/modules/user/user.controller.spec.ts` (수정)

**Interfaces:**
- Consumes: Task 2의 `UserService.loginUser(identifier, password)`
- Produces:
  - `LoginUserDto { identifier?: string; email?: string; password: string }` (`user.request.dto.ts`에서 export)
  - `UserController.loginUser(dto: LoginUserDto)`

- [ ] **Step 1: 실패 테스트 작성**

`backend/src/modules/user/user.controller.spec.ts`의 `buildController`에 `loginUser` 목을 추가한다:

```ts
    const userService = {
      updateUser: jest.fn().mockResolvedValue({ id: 1 }),
      deleteUser: jest.fn().mockResolvedValue(undefined),
      loginUser: jest.fn().mockResolvedValue({ accessToken: 't' }),
    };
```

같은 파일 맨 아래에 describe 블록을 추가한다:

```ts
describe('loginUser', () => {
  test('identifier를 서비스에 그대로 넘긴다', async () => {
    const { controller, userService } = buildController();

    await controller.loginUser({ identifier: '월요농구', password: 'pw12345678' });

    expect(userService.loginUser).toHaveBeenCalledWith('월요농구', 'pw12345678');
  });

  // 캐시된 구버전 프론트 번들은 여전히 email 키로 보낸다.
  test('identifier가 없으면 레거시 email 키를 쓴다', async () => {
    const { controller, userService } = buildController();

    await controller.loginUser({ email: 'a@b.co', password: 'pw12345678' });

    expect(userService.loginUser).toHaveBeenCalledWith('a@b.co', 'pw12345678');
  });
});
```

- [ ] **Step 2: DTO 검증 테스트 작성**

`backend/src/modules/user/user-login-dto.spec.ts` 생성:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginUserDto } from './user.request.dto';

const validateBody = (body: Record<string, unknown>) =>
  validate(plainToInstance(LoginUserDto, body));

describe('LoginUserDto', () => {
  test('identifier + password면 통과한다', async () => {
    expect(await validateBody({ identifier: '월요농구', password: 'pw12345678' })).toHaveLength(0);
  });

  test('레거시 email + password면 통과한다', async () => {
    expect(await validateBody({ email: 'a@b.co', password: 'pw12345678' })).toHaveLength(0);
  });

  test('identifier와 email이 둘 다 없으면 실패한다', async () => {
    const errors = await validateBody({ password: 'pw12345678' });
    expect(errors.length).toBeGreaterThan(0);
  });

  test('password가 없으면 실패한다', async () => {
    const errors = await validateBody({ identifier: '월요농구' });
    expect(errors.map((e) => e.property)).toContain('password');
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

```bash
cd backend && pnpm test -- src/modules/user/user-login-dto.spec.ts src/modules/user/user.controller.spec.ts
```

Expected: FAIL — `LoginUserDto`가 없어 컴파일 에러

- [ ] **Step 4: 구현**

`backend/src/modules/user/user.request.dto.ts` 상단 import에 `ValidateIf`를 추가하고, 파일 끝에 DTO를 추가한다:

```ts
export class LoginUserDto {
  // 이메일 또는 그룹명. 둘 다 비면 양쪽 검증이 모두 실패해 400이 된다.
  @ValidateIf((o: LoginUserDto) => !o.email)
  @IsString()
  @IsNotEmpty()
  identifier?: string;

  // 캐시된 구버전 프론트 번들 호환용 — 새 클라이언트는 identifier를 보낸다.
  // 전역 ValidationPipe가 forbidNonWhitelisted라 여기 선언해 두지 않으면 400이 난다.
  @ValidateIf((o: LoginUserDto) => !o.identifier)
  @IsString()
  @IsNotEmpty()
  email?: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
```

`backend/src/modules/user/user.controller.ts`의 import에 `LoginUserDto`를 추가하고 로그인 핸들러를 교체한다:

```ts
  @Post('login')
  async loginUser(@Body(ValidationPipe) dto: LoginUserDto) {
    return this.userService.loginUser(dto.identifier ?? dto.email ?? '', dto.password);
  }
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd backend && pnpm test
```

Expected: 전부 PASS

- [ ] **Step 6: 커밋**

```bash
cd /Users/onady/project/dngg
git add backend/src/modules/user/user.request.dto.ts backend/src/modules/user/user.controller.ts backend/src/modules/user/user.controller.spec.ts backend/src/modules/user/user-login-dto.spec.ts
git commit -m "feat: 로그인 요청에 identifier 필드 추가 (레거시 email 키 계속 수용)"
```

---

### Task 4: 로그인 시도 rate limit

`GET /group/all`이 인증 없이 전체 그룹명을 반환하므로, 그룹명을 아이디로 쓰는 순간 유효한 아이디 목록이 공개된 셈이 된다. 지금 백엔드에는 rate limit이 전혀 없다.

**추적 키는 IP가 아니라 아이디다.** 백엔드가 HTTPS 리버스 프록시 뒤에 있고 `main.ts`에 `trust proxy` 설정이 없어 `req.ip`가 프록시 IP로 뭉개진다 — IP 기준으로 걸면 전체 사용자가 한 버킷을 공유해 정상 사용자까지 차단된다.

**Files:**
- Create: `backend/src/modules/user/login-throttler.guard.ts`
- Modify: `backend/src/modules/user/user.module.ts`
- Modify: `backend/src/modules/user/user.controller.ts` (가드 부착)
- Modify: `backend/package.json` (`@nestjs/throttler`)
- Test: `backend/src/modules/user/login-throttler.guard.spec.ts` (신규)

**Interfaces:**
- Consumes: Task 3의 `LoginUserDto` (바디 키 `identifier` / `email`)
- Produces:
  - `resolveLoginTracker(req: LoginThrottleRequest): string`
  - `LoginThrottlerGuard` (`@nestjs/throttler`의 `ThrottlerGuard` 서브클래스)
  - `LOGIN_THROTTLE_TTL_MS = 300_000`, `LOGIN_THROTTLE_LIMIT = 10`

- [ ] **Step 1: 의존성 추가**

```bash
cd backend && pnpm add @nestjs/throttler@6.5.0
```

`6.5.0`은 `@nestjs/common`/`@nestjs/core` `^11.0.0`을 peer로 지원한다.

- [ ] **Step 2: 실패 테스트 작성**

`backend/src/modules/user/login-throttler.guard.spec.ts` 생성:

```ts
import {
  LOGIN_THROTTLE_LIMIT,
  LOGIN_THROTTLE_TTL_MS,
  resolveLoginTracker,
} from './login-throttler.guard';

describe('resolveLoginTracker', () => {
  test('바디의 identifier를 키로 쓴다', () => {
    expect(
      resolveLoginTracker({ body: { identifier: '월요농구' }, ip: '1.2.3.4' }),
    ).toBe('id:월요농구');
  });

  test('앞뒤 공백을 제거해 같은 버킷으로 모은다', () => {
    expect(resolveLoginTracker({ body: { identifier: '  월요농구 ' } })).toBe(
      'id:월요농구',
    );
  });

  test('identifier가 없으면 레거시 email 키를 쓴다', () => {
    expect(resolveLoginTracker({ body: { email: 'a@b.co' } })).toBe('id:a@b.co');
  });

  test('아이디가 없거나 빈 문자열이면 IP로 폴백한다', () => {
    expect(resolveLoginTracker({ body: { identifier: '   ' }, ip: '1.2.3.4' })).toBe(
      'ip:1.2.3.4',
    );
    expect(resolveLoginTracker({ body: {} , ip: '1.2.3.4' })).toBe('ip:1.2.3.4');
    expect(resolveLoginTracker({})).toBe('ip:unknown');
  });

  test('문자열이 아닌 아이디는 IP로 폴백한다', () => {
    expect(resolveLoginTracker({ body: { identifier: { $ne: null } }, ip: '1.2.3.4' })).toBe(
      'ip:1.2.3.4',
    );
  });

  test('한도는 5분에 10회다', () => {
    expect(LOGIN_THROTTLE_TTL_MS).toBe(300_000);
    expect(LOGIN_THROTTLE_LIMIT).toBe(10);
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

```bash
cd backend && pnpm test -- src/modules/user/login-throttler.guard.spec.ts
```

Expected: FAIL — `login-throttler.guard.ts` 모듈을 찾을 수 없음

- [ ] **Step 4: 구현**

`backend/src/modules/user/login-throttler.guard.ts` 생성:

```ts
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// 로그인 시도 제한 창 — 5분에 10회
export const LOGIN_THROTTLE_TTL_MS = 300_000;
export const LOGIN_THROTTLE_LIMIT = 10;

export interface LoginThrottleRequest {
  body?: { identifier?: unknown; email?: unknown };
  ip?: string;
}

// IP가 아니라 아이디 기준으로 센다. 백엔드가 HTTPS 리버스 프록시 뒤에 있는데
// main.ts에 trust proxy 설정이 없어 req.ip가 프록시 IP로 뭉개진다 — IP 기준이면
// 전체 사용자가 한 버킷을 공유해 정상 사용자까지 차단된다.
// 트레이드오프: 특정 그룹의 로그인을 일시적으로 막을 수 있으나, 영구 잠금이 아니라
// 창이 지나면 자동 해제된다.
export function resolveLoginTracker(req: LoginThrottleRequest): string {
  const raw = req.body?.identifier ?? req.body?.email;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return `id:${raw.trim()}`;
  }
  return `ip:${req.ip ?? 'unknown'}`;
}

@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(resolveLoginTracker(req as LoginThrottleRequest));
  }
}
```

`backend/src/modules/user/user.module.ts`에 모듈과 provider를 등록한다:

```ts
import { ThrottlerModule } from '@nestjs/throttler';
import {
  LOGIN_THROTTLE_LIMIT,
  LOGIN_THROTTLE_TTL_MS,
  LoginThrottlerGuard,
} from './login-throttler.guard';
```

`imports` 배열에 추가:

```ts
    // 전역 가드로 걸지 않는다 — /user/login에만 @UseGuards로 붙인다.
    ThrottlerModule.forRoot([
      { ttl: LOGIN_THROTTLE_TTL_MS, limit: LOGIN_THROTTLE_LIMIT },
    ]),
```

`providers` 배열에 `LoginThrottlerGuard`를 추가한다.

`backend/src/modules/user/user.controller.ts`의 로그인 핸들러에 가드를 붙인다 (import도 추가):

```ts
  @Post('login')
  @UseGuards(LoginThrottlerGuard)
  async loginUser(@Body(ValidationPipe) dto: LoginUserDto) {
    return this.userService.loginUser(dto.identifier ?? dto.email ?? '', dto.password);
  }
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd backend && pnpm test -- src/modules/user/login-throttler.guard.spec.ts
```

Expected: PASS (6 tests)

- [ ] **Step 6: 앱이 실제로 부팅되는지 확인**

`ThrottlerModule` 배선이 틀리면 가드 주입이 런타임에만 실패하므로 빌드만으로는 부족하다.

```bash
cd /Users/onady/project/dngg && docker compose up -d db
cd backend && pnpm build
cd backend && pnpm dev > /tmp/dngg-backend.log 2>&1 &
sleep 15 && grep -c "Nest application successfully started" /tmp/dngg-backend.log
```

Expected: `1`. 부팅에 실패하면 `/tmp/dngg-backend.log`에 주입 에러가 남는다.

이어서 같은 아이디로 12번 시도한다:

```bash
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3010/user/login \
    -H 'Content-Type: application/json' \
    -d '{"identifier":"없는그룹","password":"wrongpass"}'
done
```

Expected: 401이 10번, 그 뒤 429가 2번

확인 후 백그라운드 프로세스를 정리한다:

```bash
pkill -f "nest start" || true
```

- [ ] **Step 7: 전체 테스트 + 린트**

```bash
cd backend && pnpm test && npx eslint src/modules/user --ext .ts
```

Expected: 전부 PASS, 린트 에러 없음

- [ ] **Step 8: 커밋**

```bash
cd /Users/onady/project/dngg
git add backend/package.json backend/pnpm-lock.yaml backend/src/modules/user/login-throttler.guard.ts backend/src/modules/user/login-throttler.guard.spec.ts backend/src/modules/user/user.module.ts backend/src/modules/user/user.controller.ts
git commit -m "feat: 로그인 시도를 아이디 기준 5분 10회로 제한"
```

---

### Task 5: 로그인 폼을 이메일/그룹명 겸용으로 변경

**Files:**
- Modify: `frontend/src/app/components/Login.tsx`

**Interfaces:**
- Consumes: Task 3의 요청 바디 `{ identifier, password }`, Task 4의 429 응답
- Produces: 없음 (최종 소비자)

- [ ] **Step 1: 안내 문구용 styled 컴포넌트 추가**

`frontend/src/app/components/Login.tsx`의 `AuthSwitchRow` 정의 아래에 추가한다:

```tsx
const AuthHint = styled.p`
  margin-top: -0.5rem;
  font-size: 0.8125rem;
  color: #6b7280;
`;
```

- [ ] **Step 2: 상태와 요청을 identifier로 교체**

`const [email, setEmail] = useState("");`를 아래로 바꾼다:

```tsx
  const [identifier, setIdentifier] = useState("");
```

`handleLogin`의 요청과 에러 분기를 교체한다 (기존 `Login.tsx:91`과 `Login.tsx:105-114`):

```tsx
      const response = await api.post(`/user/login`, { identifier, password });
```

```tsx
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 429) {
        showToast("시도가 너무 많아요. 잠시 후 다시 시도해주세요.", "error");
      } else if (status === 401) {
        // 백엔드가 아이디 미존재와 비밀번호 오류를 401 하나로 통일해 응답한다.
        showToast("아이디 또는 비밀번호가 올바르지 않습니다.", "error");
      } else {
        showToast("로그인에 실패했습니다. 잠시 후 다시 시도해주세요.", "error");
      }
    }
```

- [ ] **Step 3: 입력 필드와 안내 문구 교체**

기존 아이디 입력(`Login.tsx:122-129`)을 아래로 바꾸고 바로 뒤에 안내 문구를 넣는다:

```tsx
          <AuthInput
            type="text"
            placeholder="이메일 또는 그룹명"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            autoComplete="username"
          />
          <AuthHint>그룹명으로도 로그인할 수 있어요.</AuthHint>
```

- [ ] **Step 4: 빌드와 린트 확인**

```bash
cd frontend && pnpm lint && pnpm build
```

Expected: 에러 없음. `email`/`setEmail`이 파일에 남아 있으면 안 된다 — `grep -n "email" src/app/components/Login.tsx`로 확인하면 `response.data.user.email`(스토어 저장용) 한 곳만 나와야 한다.

- [ ] **Step 5: 수동 확인**

백엔드(`cd backend && pnpm dev`)와 프론트(`cd frontend && pnpm dev`)를 띄우고 `http://localhost:3011/settings`에서 확인한다:

1. 기존 계정의 **이메일**로 로그인 → 성공, 토스트 "로그인되었습니다."
2. 같은 계정의 **그룹명**으로 로그인 → 성공
3. 없는 그룹명 입력 → "아이디 또는 비밀번호가 올바르지 않습니다."
4. 틀린 비밀번호 → 같은 문구 (3번과 구분되지 않아야 한다)
5. 같은 아이디로 11번 연속 실패 → "시도가 너무 많아요..." 토스트

- [ ] **Step 6: 커밋**

```bash
cd /Users/onady/project/dngg
git add frontend/src/app/components/Login.tsx
git commit -m "feat: 로그인 폼에서 이메일 또는 그룹명을 함께 입력받도록 변경"
```

---

### Task 6: 문서 갱신

**Files:**
- Modify: `CLAUDE.md` (프론트엔드 아키텍처 섹션)

**Interfaces:**
- Consumes: Task 1~5의 결과
- Produces: 없음

- [ ] **Step 1: CLAUDE.md에 로그인 규칙 한 줄 추가**

`## 프론트엔드 아키텍처` 섹션의 **인증 상태**는 이원화되어 있다 항목 바로 위에 추가한다:

```markdown
- **로그인 아이디**는 이메일 또는 그룹명이다 (`POST /user/login`의 `identifier`). 백엔드는 캐시된 구버전 번들 호환을 위해 레거시 `email` 키도 계속 받는다. 로그인 실패는 아이디 미존재·비밀번호 오류 구분 없이 401 하나로 응답하며, `/user/login`에는 아이디 기준 rate limit(5분 10회, 초과 시 429)이 걸려 있다.
```

- [ ] **Step 2: 마크다운 린트**

```bash
cd /Users/onady/project/dngg && npx markdownlint-cli CLAUDE.md
```

Expected: 에러 없음 (도구가 없으면 이 단계는 건너뛴다)

- [ ] **Step 3: 커밋**

```bash
cd /Users/onady/project/dngg
git add CLAUDE.md
git commit -m "docs: 이메일·그룹명 겸용 로그인 규칙을 CLAUDE.md에 기록"
```

---

## 배포 노트

- **DB 스키마 변경 없음** → 마이그레이션 불필요.
- 백엔드가 레거시 `email` 키를 계속 받으므로 백엔드 선행 배포가 안전하다. 프론트는 그 뒤 아무 때나 나가도 된다.
- `main` 푸시가 곧 운영 배포다. 백엔드·프론트가 각각 별도 잡이므로, 함께 내보내려면 Actions 탭의 workflow_dispatch로 동시 배포할 것.
- CI 헬스체크는 `/group/all`과 프론트 루트만 확인한다 — 배포 후 이메일 로그인과 그룹명 로그인을 **직접 스모크**할 것.
