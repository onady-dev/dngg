# 관리자 페이지 + 유료화 서비스 시작 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 전용 `/admin` 페이지에서 "유료화 서비스 시작" 버튼으로 전 그룹 무료 게이팅을 발동하고(기존 게임 수 backfill), 관리자가 그룹 전환으로 모든 그룹의 데이터를 입력할 수 있게 한다.

**Architecture:** `User.role` + JWT role 전파 + `AdminGuard`로 관리자 API를 보호한다. 유료화 시작은 `AppSetting` key-value 행의 존재로 판정하며(단방향), 시작 시 각 그룹의 `freeGamesUsed`를 실제 게임 수로 backfill한다. 교차그룹 접근은 `POST /admin/switch-group/:groupId`가 대상 groupId를 담은 JWT를 재발급하는 방식 — 기존 `assertSameGroup` 검증 로직은 하나도 수정하지 않는다.

**Tech Stack:** NestJS 11 + TypeORM(PostgreSQL, `synchronize: true`) + passport-jwt / Next.js 14 App Router + Zustand + TanStack Query + styled-components

**Spec:** `docs/superpowers/specs/2026-07-15-admin-page-design.md`
**Branch:** `feature/admin-page` (feature/subscription 위에서 분기 — 구독 게이팅 코드에 의존)

## Global Constraints

- 커밋 메시지의 제목·본문은 **한글**로 작성한다 (타입 접두어 `feat:`/`fix:`/`docs:`는 영문 유지) — 루트 `CLAUDE.md` 커밋 규칙.
- `billingKey`는 **어떤 API 응답에도 포함 금지** (기존 구독 설계 원칙).
- AppSetting 키는 정확히 `'monetizationStartedAt'`, 402 에러 코드는 정확히 `'SUBSCRIPTION_REQUIRED'` (기존 `SUBSCRIPTION_REQUIRED_CODE` 상수 재사용).
- 유료화 시작 backfill은 `GREATEST(현재값, 게임 수)` — `freeGamesUsed`는 어떤 경로로도 감소하지 않는다.
- 유료화 시작은 **단방향** — 되돌리기 API/UI를 만들지 않는다.
- 프론트 API 호출은 반드시 `@/lib/axios`의 `api` 사용 (`src/app/lib/axios.ts`는 레거시 — import 금지).
- 인증 이원화 유지: 토큰 변경 시 `localStorage.token`과 `useAuthStore` **둘 다** 갱신.
- 백엔드 테스트: `backend/`에서 `pnpm test` (jest). 프론트 검증: `frontend/`에서 `pnpm build`.
- 프론트 lint는 사전결함으로 실행 불가(`eslint-config-next@14.1.0`에 없는 flat config 참조) — build 통과가 게이트.

---

### Task 1: User.role 컬럼 + JWT role 전파

**Files:**
- Modify: `backend/src/entities/User.entity.ts`
- Modify: `backend/src/modules/user/user.service.ts:82` (loginUser payload)
- Modify: `backend/src/modules/user/jwt.strategy.ts:15-17` (validate)
- Test: `backend/src/modules/user/user-role.spec.ts` (신규)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `User.role: string` ('user' | 'admin', default 'user'); JWT payload에 `role` 포함; `req.user`가 `{ userId, email, groupId, role }` 형태 — 이후 모든 태스크의 AdminGuard/게이팅이 `req.user.role`을 사용

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/modules/user/user-role.spec.ts` 생성:

```typescript
import * as bcrypt from 'bcrypt';
import { UserService } from './user.service';
import { JwtStrategy } from './jwt.strategy';

describe('User role JWT 전파', () => {
  test('loginUser는 JWT payload에 role을 포함한다', async () => {
    const hashed = await bcrypt.hash('pw1234', 4);
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        email: 'admin@test.com',
        groupId: 7,
        role: 'admin',
        password: hashed,
      }),
    };
    const jwtService = { sign: jest.fn().mockReturnValue('signed-token') };
    const service = new UserService(
      userRepo as any,
      {} as any,
      {} as any,
      jwtService as any,
    );

    await service.loginUser('admin@test.com', 'pw1234');

    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin', groupId: 7 }),
    );
  });

  describe('JwtStrategy.validate', () => {
    beforeAll(() => {
      process.env.JWT_SECRET = 'test-secret';
    });

    test('payload의 role을 req.user로 전달한다', async () => {
      const strategy = new JwtStrategy();
      const result = await strategy.validate({
        userId: 1,
        email: 'a@b.c',
        groupId: 2,
        role: 'admin',
      });
      expect(result.role).toBe('admin');
    });

    test('role 없는 레거시 토큰은 user로 취급한다', async () => {
      const strategy = new JwtStrategy();
      const result = await strategy.validate({
        userId: 1,
        email: 'a@b.c',
        groupId: 2,
      });
      expect(result.role).toBe('user');
    });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && pnpm test -- src/modules/user/user-role.spec.ts`
Expected: FAIL — sign payload에 role 없음 / validate 반환에 role 없음

- [ ] **Step 3: 구현**

`backend/src/entities/User.entity.ts` — `createdAt` 컬럼 아래에 추가:

```typescript
  // 'user' | 'admin' — 최초 관리자는 DB 수동 지정 (UPDATE "user" SET role='admin' WHERE email='...')
  @Column('varchar', { default: 'user' })
  role: string;
```

`backend/src/modules/user/user.service.ts` loginUser의 payload(82행)를:

```typescript
    const payload = {
      userId: user.id,
      email: user.email,
      groupId: user.groupId,
      role: user.role,
    };
```

`backend/src/modules/user/jwt.strategy.ts` validate(15-17행)를:

```typescript
  async validate(payload: any) {
    return {
      userId: payload.userId,
      email: payload.email,
      groupId: payload.groupId,
      // 기존 발급 토큰에는 role이 없다 — 'user'로 취급 (재로그인 시 role 반영)
      role: payload.role ?? 'user',
    };
  }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && pnpm test -- src/modules/user/user-role.spec.ts`
Expected: PASS (3/3)

- [ ] **Step 5: 전체 테스트 + 커밋**

Run: `cd backend && pnpm test` — 전체 통과 확인 후:

```bash
git add backend/src/entities/User.entity.ts backend/src/modules/user/
git commit -m "feat: User.role 컬럼 추가 및 JWT payload에 role 전파"
```

---

### Task 2: AppSetting 엔티티 + AdminGuard

**Files:**
- Create: `backend/src/entities/AppSetting.entity.ts`
- Create: `backend/src/modules/admin/admin.constants.ts`
- Create: `backend/src/modules/admin/admin.guard.ts`
- Test: `backend/src/modules/admin/admin.guard.spec.ts` (신규)

**Interfaces:**
- Consumes: Task 1의 `req.user.role`
- Produces: `AppSetting { key: string(PK); value: string }`; `MONETIZATION_STARTED_KEY = 'monetizationStartedAt'`; `AdminGuard` (role !== 'admin' → 403 ForbiddenException) — Task 3~5가 사용

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/modules/admin/admin.guard.spec.ts` 생성:

```typescript
import { ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  const contextWithRole = (role?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : undefined }),
      }),
    }) as any;

  test('role이 admin이면 통과한다', () => {
    const guard = new AdminGuard();
    expect(guard.canActivate(contextWithRole('admin'))).toBe(true);
  });

  test('role이 user면 403을 던진다', () => {
    const guard = new AdminGuard();
    expect(() => guard.canActivate(contextWithRole('user'))).toThrow(
      ForbiddenException,
    );
  });

  test('user 객체가 없으면 403을 던진다', () => {
    const guard = new AdminGuard();
    expect(() => guard.canActivate(contextWithRole(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && pnpm test -- src/modules/admin/admin.guard.spec.ts`
Expected: FAIL — "Cannot find module './admin.guard'"

- [ ] **Step 3: 구현**

`backend/src/entities/AppSetting.entity.ts`:

```typescript
import { Column, Entity, PrimaryColumn } from 'typeorm';

// 전역 운영 설정 key-value 저장소.
// 유료화 시작 여부는 'monetizationStartedAt' 행의 존재로 판정한다 (단방향 — 삭제 API 없음).
@Entity()
export class AppSetting {
  @PrimaryColumn('varchar')
  key: string;

  @Column('varchar')
  value: string;
}
```

`backend/src/modules/admin/admin.constants.ts`:

```typescript
export const MONETIZATION_STARTED_KEY = 'monetizationStartedAt';
```

`backend/src/modules/admin/admin.guard.ts`:

```typescript
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

// AuthGuard('jwt') 뒤에 배치 — req.user는 jwt.strategy.validate의 반환값
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (request.user?.role !== 'admin') {
      throw new ForbiddenException('관리자만 사용할 수 있습니다.');
    }
    return true;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && pnpm test -- src/modules/admin/admin.guard.spec.ts`
Expected: PASS (3/3)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/entities/AppSetting.entity.ts backend/src/modules/admin/
git commit -m "feat: AppSetting 엔티티와 AdminGuard 추가"
```

---

### Task 3: admin 모듈 — 유료화 시작/조회 API

**Files:**
- Create: `backend/src/modules/admin/admin.service.ts`
- Create: `backend/src/modules/admin/admin.controller.ts`
- Create: `backend/src/modules/admin/admin.module.ts`
- Modify: `backend/src/app.module.ts` (imports 배열에 `AdminModule` 추가 — 파일을 먼저 읽고 기존 모듈 나열 패턴 그대로)
- Test: `backend/src/modules/admin/admin.service.spec.ts` (신규)

**Interfaces:**
- Consumes: Task 2의 `AppSetting`, `MONETIZATION_STARTED_KEY`, `AdminGuard`
- Produces: `AdminService.getMonetization(): Promise<{ started: boolean; startedAt: string | null }>`; `AdminService.startMonetization(now: Date): Promise<{ startedAt: string }>` (중복 시 ConflictException); 라우트 `GET /admin/monetization`, `POST /admin/monetization/start`. Task 4가 AdminService/AdminController/AdminModule에 메서드·라우트를 추가한다. Task 5의 게이팅이 AppSetting 행 존재를 조회한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/modules/admin/admin.service.spec.ts` 생성:

```typescript
import { ConflictException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { MONETIZATION_STARTED_KEY } from './admin.constants';

describe('AdminService — 유료화 시작', () => {
  const makeService = (overrides: Partial<Record<string, any>> = {}) => {
    const settingRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      ...overrides.settingRepo,
    };
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockResolvedValue(undefined),
      ...overrides.manager,
    };
    const dataSource = {
      transaction: jest.fn(
        async (fn: (m: typeof manager) => Promise<void>) => fn(manager),
      ),
    };
    const service = new AdminService(
      settingRepo as any,
      {} as any, // groupRepo — 이 스펙에서 미사용
      {} as any, // subRepo
      {} as any, // payRepo
      dataSource as any,
      {} as any, // jwtService
    );
    return { service, settingRepo, manager, dataSource };
  };

  test('시작 전 getMonetization은 started=false를 반환한다', async () => {
    const { service } = makeService();
    expect(await service.getMonetization()).toEqual({
      started: false,
      startedAt: null,
    });
  });

  test('시작 후 getMonetization은 시작 시각을 반환한다', async () => {
    const { service } = makeService({
      settingRepo: {
        findOne: jest.fn().mockResolvedValue({
          key: MONETIZATION_STARTED_KEY,
          value: '2026-07-15T00:00:00.000Z',
        }),
      },
    });
    expect(await service.getMonetization()).toEqual({
      started: true,
      startedAt: '2026-07-15T00:00:00.000Z',
    });
  });

  test('startMonetization은 트랜잭션 안에서 backfill 후 설정을 insert한다', async () => {
    const { service, manager } = makeService();
    const now = new Date('2026-07-15T09:00:00.000Z');

    const result = await service.startMonetization(now);

    expect(result.startedAt).toBe('2026-07-15T09:00:00.000Z');
    // backfill: GREATEST로 감소 방지 + 게임 수 서브쿼리
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('GREATEST'),
    );
    expect(manager.insert).toHaveBeenCalledWith(expect.anything(), {
      key: MONETIZATION_STARTED_KEY,
      value: '2026-07-15T09:00:00.000Z',
    });
  });

  test('이미 시작됐으면(중복 insert) 409를 던진다', async () => {
    const { service } = makeService({
      manager: { insert: jest.fn().mockRejectedValue({ code: '23505' }) },
    });
    await expect(
      service.startMonetization(new Date()),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && pnpm test -- src/modules/admin/admin.service.spec.ts`
Expected: FAIL — "Cannot find module './admin.service'"

- [ ] **Step 3: 구현**

`backend/src/modules/admin/admin.service.ts`:

```typescript
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { DataSource, Repository } from 'typeorm';
import { AppSetting } from 'src/entities/AppSetting.entity';
import { Group } from 'src/entities/Group.entity';
import { Subscription } from 'src/entities/Subscription.entity';
import { Payment } from 'src/entities/Payment.entity';
import { MONETIZATION_STARTED_KEY } from './admin.constants';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(AppSetting)
    private readonly settingRepo: Repository<AppSetting>,
    @InjectRepository(Group)
    private readonly groupRepo: Repository<Group>,
    @InjectRepository(Subscription)
    private readonly subRepo: Repository<Subscription>,
    @InjectRepository(Payment)
    private readonly payRepo: Repository<Payment>,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
  ) {}

  async getMonetization(): Promise<{
    started: boolean;
    startedAt: string | null;
  }> {
    const row = await this.settingRepo.findOne({
      where: { key: MONETIZATION_STARTED_KEY },
    });
    return { started: !!row, startedAt: row?.value ?? null };
  }

  // 유료화 시작 (단방향). backfill과 설정 기록은 한 트랜잭션 —
  // 설정 PK 중복(23505)이 동시/중복 클릭 방지선이다.
  async startMonetization(now: Date): Promise<{ startedAt: string }> {
    const startedAt = now.toISOString();
    try {
      await this.dataSource.transaction(async (manager) => {
        // 각 그룹의 현재 게임 수를 무료 사용량으로 스냅샷.
        // GREATEST로 기존 값을 절대 줄이지 않는다.
        await manager.query(
          'UPDATE "group" g SET "freeGamesUsed" = GREATEST(g."freeGamesUsed", (SELECT COUNT(*)::int FROM "game" WHERE "game"."groupId" = g.id))',
        );
        await manager.insert(AppSetting, {
          key: MONETIZATION_STARTED_KEY,
          value: startedAt,
        });
      });
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new ConflictException('이미 유료화가 시작되었습니다.');
      }
      throw error;
    }
    return { startedAt };
  }
}
```

`backend/src/modules/admin/admin.controller.ts`:

```typescript
import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AuthGuard('jwt'), AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('monetization')
  getMonetization() {
    return this.adminService.getMonetization();
  }

  @Post('monetization/start')
  startMonetization() {
    return this.adminService.startMonetization(new Date());
  }
}
```

`backend/src/modules/admin/admin.module.ts` (JwtModule 설정은 `user.module.ts`와 동일 — switch-group 토큰 발급이 Task 4에서 사용):

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppSetting } from 'src/entities/AppSetting.entity';
import { Group } from 'src/entities/Group.entity';
import { Subscription } from 'src/entities/Subscription.entity';
import { Payment } from 'src/entities/Payment.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
      }),
    }),
    TypeOrmModule.forFeature([AppSetting, Group, Subscription, Payment]),
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && pnpm test -- src/modules/admin/admin.service.spec.ts`
Expected: PASS (4/4)

- [ ] **Step 5: 전체 테스트 + 커밋**

Run: `cd backend && pnpm test` — 전체 통과 확인 후:

```bash
git add backend/src/modules/admin/ backend/src/app.module.ts
git commit -m "feat: admin 모듈과 유료화 시작 API 추가 (기존 게임 수 backfill)"
```

---

### Task 4: admin 모듈 — 그룹/구독 현황 + 그룹 전환 토큰

**Files:**
- Modify: `backend/src/modules/admin/admin.service.ts` (메서드 3개 추가)
- Modify: `backend/src/modules/admin/admin.controller.ts` (라우트 3개 추가)
- Test: `backend/src/modules/admin/admin.service.spec.ts` (describe 블록 추가)

**Interfaces:**
- Consumes: Task 3의 AdminService/AdminController 골격, Task 1의 `req.user = { userId, email, groupId, role }`
- Produces:
  - `GET /admin/groups` → `{ id, name, gameCount, freeGamesUsed, subscriptionStatus }[]`
  - `GET /admin/subscriptions` → `{ statusCounts: { status, count }[], recentPayments: { id, groupName, amount, status, orderId, paidAt, failReason }[] }`
  - `POST /admin/switch-group/:groupId` → `{ accessToken: string; groupId: number }` (없는/삭제된 그룹 404)
  - Task 6·7 프론트가 이 세 응답 shape을 그대로 사용

- [ ] **Step 1: 실패하는 테스트 작성**

`admin.service.spec.ts`에 describe 블록 추가 (import에 `NotFoundException` 추가):

```typescript
import { NotFoundException } from '@nestjs/common';

describe('AdminService — 현황/그룹 전환', () => {
  test('getGroups는 그룹별 게임 수·무료 사용량·구독 상태를 합성한다', async () => {
    const groupRepo = {
      find: jest.fn().mockResolvedValue([
        { id: 1, name: '알파', freeGamesUsed: 3 },
        { id: 2, name: '베타', freeGamesUsed: 12 },
      ]),
    };
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ groupId: 1, count: 5 }]),
    };
    const subRepo = {
      find: jest.fn().mockResolvedValue([
        { status: 'active', group: { id: 2 } },
      ]),
    };
    const service = new AdminService(
      {} as any,
      groupRepo as any,
      subRepo as any,
      {} as any,
      dataSource as any,
      {} as any,
    );

    const rows = await service.getGroups();

    expect(rows).toEqual([
      {
        id: 1,
        name: '알파',
        gameCount: 5,
        freeGamesUsed: 3,
        subscriptionStatus: 'none',
      },
      {
        id: 2,
        name: '베타',
        gameCount: 0,
        freeGamesUsed: 12,
        subscriptionStatus: 'active',
      },
    ]);
  });

  test('getSubscriptionOverview의 결제 목록에 billingKey가 없다', async () => {
    const subRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue([{ status: 'active', count: 2 }]),
      }),
    };
    const payRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 10,
          amount: 9900,
          status: 'success',
          orderId: 'ord_1',
          paidAt: new Date('2026-07-15T00:00:00.000Z'),
          failReason: null,
          group: { id: 1, name: '알파' },
          subscription: { billingKey: 'MUST_NOT_LEAK' },
        },
      ]),
    };
    const service = new AdminService(
      {} as any,
      {} as any,
      subRepo as any,
      payRepo as any,
      {} as any,
      {} as any,
    );

    const result = await service.getSubscriptionOverview();

    expect(result.statusCounts).toEqual([{ status: 'active', count: 2 }]);
    expect(result.recentPayments[0]).toEqual({
      id: 10,
      groupName: '알파',
      amount: 9900,
      status: 'success',
      orderId: 'ord_1',
      paidAt: new Date('2026-07-15T00:00:00.000Z'),
      failReason: null,
    });
    expect(JSON.stringify(result)).not.toContain('MUST_NOT_LEAK');
  });

  test('switchGroup은 대상 groupId와 role=admin을 담은 토큰을 발급한다', async () => {
    const groupRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 5, isDeleted: false }),
    };
    const jwtService = { sign: jest.fn().mockReturnValue('scoped-token') };
    const service = new AdminService(
      {} as any,
      groupRepo as any,
      {} as any,
      {} as any,
      {} as any,
      jwtService as any,
    );

    const result = await service.switchGroup(
      { userId: 1, email: 'admin@test.com' },
      5,
    );

    expect(jwtService.sign).toHaveBeenCalledWith({
      userId: 1,
      email: 'admin@test.com',
      groupId: 5,
      role: 'admin',
    });
    expect(result).toEqual({ accessToken: 'scoped-token', groupId: 5 });
  });

  test('switchGroup은 없는 그룹이면 404를 던진다', async () => {
    const groupRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new AdminService(
      {} as any,
      groupRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await expect(
      service.switchGroup({ userId: 1, email: 'a@b.c' }, 99),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && pnpm test -- src/modules/admin/admin.service.spec.ts`
Expected: FAIL — getGroups/getSubscriptionOverview/switchGroup 미정의

- [ ] **Step 3: 구현**

`admin.service.ts` import를 다음으로 갱신하고 메서드 3개 추가:

```typescript
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In, Repository } from 'typeorm';
import { ACTIVE_STATUSES } from '../subscription/subscription.constants';
```

```typescript
  async getGroups(): Promise<
    {
      id: number;
      name: string;
      gameCount: number;
      freeGamesUsed: number;
      subscriptionStatus: string;
    }[]
  > {
    const groups = await this.groupRepo.find({
      where: { isDeleted: false },
      order: { id: 'ASC' },
    });
    const counts: { groupId: number; count: number }[] =
      await this.dataSource.query(
        'SELECT "groupId", COUNT(*)::int AS count FROM "game" GROUP BY "groupId"',
      );
    const countMap = new Map(
      counts.map((row) => [Number(row.groupId), Number(row.count)]),
    );
    const activeSubs = await this.subRepo.find({
      where: { status: In(ACTIVE_STATUSES) },
      relations: ['group'],
    });
    const statusMap = new Map(
      activeSubs
        .filter((sub) => sub.group)
        .map((sub) => [sub.group.id, sub.status as string]),
    );
    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      gameCount: countMap.get(group.id) ?? 0,
      freeGamesUsed: group.freeGamesUsed,
      subscriptionStatus: statusMap.get(group.id) ?? 'none',
    }));
  }

  async getSubscriptionOverview(): Promise<{
    statusCounts: { status: string; count: number }[];
    recentPayments: {
      id: number;
      groupName: string;
      amount: number;
      status: string;
      orderId: string;
      paidAt: Date | null;
      failReason: string | null;
    }[];
  }> {
    const statusCounts: { status: string; count: number }[] =
      await this.subRepo
        .createQueryBuilder('sub')
        .select('sub.status', 'status')
        .addSelect('COUNT(*)::int', 'count')
        .groupBy('sub.status')
        .getRawMany();
    const payments = await this.payRepo.find({
      order: { id: 'DESC' },
      take: 20,
      relations: ['group'],
    });
    // billingKey는 Subscription에만 있지만, 명시적 필드 매핑으로 이중 방어한다.
    const recentPayments = payments.map((payment) => ({
      id: payment.id,
      groupName: payment.group?.name ?? '(삭제된 그룹)',
      amount: payment.amount,
      status: payment.status,
      orderId: payment.orderId,
      paidAt: payment.paidAt ?? null,
      failReason: payment.failReason ?? null,
    }));
    return { statusCounts, recentPayments };
  }

  // 그룹 전환용 스코프 토큰 — 기존 groupId 신뢰 모델을 그대로 통과시키기 위해
  // 대상 groupId를 담은 JWT를 재발급한다. role=admin 유지(게이팅 우회용).
  async switchGroup(
    admin: { userId: number; email: string },
    groupId: number,
  ): Promise<{ accessToken: string; groupId: number }> {
    const group = await this.groupRepo.findOne({
      where: { id: groupId, isDeleted: false },
    });
    if (!group) {
      throw new NotFoundException('그룹을 찾을 수 없습니다.');
    }
    const payload = {
      userId: admin.userId,
      email: admin.email,
      groupId,
      role: 'admin',
    };
    return { accessToken: this.jwtService.sign(payload), groupId };
  }
```

`admin.controller.ts` — import를 다음으로 갱신하고 라우트 3개 추가:

```typescript
import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
```

```typescript
  @Get('groups')
  getGroups() {
    return this.adminService.getGroups();
  }

  @Get('subscriptions')
  getSubscriptionOverview() {
    return this.adminService.getSubscriptionOverview();
  }

  @Post('switch-group/:groupId')
  switchGroup(
    @Req() req: any,
    @Param('groupId', ParseIntPipe) groupId: number,
  ) {
    return this.adminService.switchGroup(
      { userId: req.user.userId, email: req.user.email },
      groupId,
    );
  }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && pnpm test -- src/modules/admin/admin.service.spec.ts`
Expected: PASS (8/8)

- [ ] **Step 5: 전체 테스트 + 커밋**

Run: `cd backend && pnpm test` — 전체 통과 확인 후:

```bash
git add backend/src/modules/admin/
git commit -m "feat: 관리자 그룹·구독 현황 조회와 그룹 전환 토큰 API 추가"
```

---

### Task 5: 게이팅 조건 변경 + 구독 status에 monetizationStarted

**Files:**
- Modify: `backend/src/modules/game/game.controller.ts:62-69` (role 전달)
- Modify: `backend/src/modules/game/game.service.ts` (`saveGameAndLogs` 시그니처 + 게이팅 블록, 161-197행 부근)
- Modify: `backend/src/modules/subscription/subscription.service.ts` (`SubscriptionStatusResponse` + `getStatus`)
- Test: `backend/src/modules/game/game.service.gating.spec.ts` (기존 수정 + 신규 케이스), `backend/src/modules/subscription/subscription.service.spec.ts` (getStatus 단언 추가)

**Interfaces:**
- Consumes: Task 2의 `AppSetting`/`MONETIZATION_STARTED_KEY`, Task 1의 `req.user.role`
- Produces: `saveGameAndLogs(dto, userGroupId, userRole?: string)`; `GET /subscription/status` 응답에 `monetizationStarted: boolean` 추가 — Task 7 프론트가 사용

- [ ] **Step 1: 기존 게이팅 스펙 파악 + 실패하는 테스트 작성**

먼저 `game.service.gating.spec.ts`와 `subscription.service.spec.ts`를 읽고 기존 mock 구조를 파악한다. 그 다음:

(a) **기존 테스트 보존**: 기존 게이팅 테스트들은 "유료화 시작 후" 상황이 전제가 되도록, queryRunner `manager` mock에 AppSetting 조회를 추가한다 (기존 mock 패턴에 맞춰):

```typescript
import { AppSetting } from '../../entities/AppSetting.entity';

// 기존 manager mock에 추가 — AppSetting 조회 시 시작됨 행 반환, 그 외 기존 동작 유지
manager.findOne = jest.fn().mockImplementation((entity: any) =>
  entity === AppSetting
    ? Promise.resolve({
        key: 'monetizationStartedAt',
        value: '2026-07-15T00:00:00.000Z',
      })
    : Promise.resolve(null),
);
```

(주의: 기존 spec에서 `manager.findOne`을 이미 다른 용도로 mock하고 있다면 entity 분기에 그 동작을 보존한다.)

(b) **신규 테스트 2개 추가** (기존 describe에, 기존 헬퍼/mock 패턴 재사용 — 아래는 의도이며 mock 변수명은 기존 spec에 맞춘다):

```typescript
test('유료화 시작 전에는 구독 없이도 게이팅 없이 통과하고 카운터가 증가하지 않는다', async () => {
  // AppSetting 조회가 null을 반환하도록 설정 (시작 전)
  manager.findOne = jest.fn().mockResolvedValue(null);

  await service.saveGameAndLogs(newGameDto, GROUP_ID); // 기존 헬퍼의 신규 생성 dto

  // 구독 조회도, 원자 증가도 호출되지 않는다
  expect(manager.count).not.toHaveBeenCalled();
  expect(counterUpdateExecute).not.toHaveBeenCalled(); // 기존 spec의 카운터 QB execute mock 이름에 맞출 것
});

test('관리자는 유료화 시작 후에도 게이팅 없이 통과하고 카운터가 증가하지 않는다', async () => {
  // AppSetting은 시작됨 상태 유지 ((a)의 mock)
  await service.saveGameAndLogs(newGameDto, GROUP_ID, 'admin');

  expect(manager.count).not.toHaveBeenCalled();
  expect(counterUpdateExecute).not.toHaveBeenCalled();
});
```

(c) **subscription status 테스트**: `subscription.service.spec.ts`에 getStatus의 `monetizationStarted` 단언 추가 (기존 dataSource mock 구조에 맞춰 — `dataSource.getRepository`가 AppSetting repo mock을 반환하도록):

```typescript
test('getStatus는 유료화 시작 여부를 포함한다', async () => {
  const settingRepoMock = { findOne: jest.fn().mockResolvedValue(null) };
  dataSource.getRepository = jest.fn().mockReturnValue(settingRepoMock);

  const status = await service.getStatus(GROUP_ID);

  expect(status.monetizationStarted).toBe(false);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && pnpm test -- src/modules/game/game.service.gating.spec.ts src/modules/subscription/subscription.service.spec.ts`
Expected: 신규 테스트 FAIL (시작 전에도 count 호출됨 / userRole 파라미터 없음 / monetizationStarted undefined)

- [ ] **Step 3: 구현**

`game.controller.ts` 69행:

```typescript
    return this.gameService.saveGameAndLogs(dto, req.user.groupId, req.user.role);
```

`game.service.ts` — `saveGameAndLogs` 시그니처에 `userRole?: string` 추가(기존 파라미터 뒤), import에 아래 추가:

```typescript
import { AppSetting } from '../../entities/AppSetting.entity';
import { MONETIZATION_STARTED_KEY } from '../admin/admin.constants';
```

게이팅 블록(165-197행 부근)을 다음으로 교체:

```typescript
      // 게이팅: 신규 생성(!dto.id)에만 적용. 기존 게임 수정은 통과.
      if (!dto.id) {
        // 카운터/저장 groupId 일관성: 게이팅은 신뢰 값(userGroupId)으로
        // 세는데 게임은 dto.groupId로 저장되므로, 둘이 다르면 A 그룹 한도를
        // 소비하고 B 그룹에 게임을 만드는 우회가 가능하다. 신규 생성 시 일치 강제.
        assertSameGroup(userGroupId, dto.groupId);
        // 유료화 시작 전에는 게이팅·카운터 완전 비활성 (무제한 무료 생성).
        // 관리자는 시작 후에도 우회 (운영 지원 입력, 카운터 미증가).
        const monetizationStarted = await queryRunner.manager.findOne(
          AppSetting,
          { where: { key: MONETIZATION_STARTED_KEY } },
        );
        if (monetizationStarted && userRole !== 'admin') {
          const activeSubs = await queryRunner.manager.count(Subscription, {
            where: { group: { id: userGroupId }, status: In(ACTIVE_STATUSES) },
          });
          if (activeSubs === 0) {
            const limit = getFreeGameLimit();
            // 원자적 증가 + 한도 재확인 (동시 요청 레이스 방지)
            const result = await queryRunner.manager
              .createQueryBuilder()
              .update(Group)
              .set({ freeGamesUsed: () => '"freeGamesUsed" + 1' })
              .where('id = :id AND "freeGamesUsed" < :limit', {
                id: userGroupId,
                limit,
              })
              .execute();
            if (!result.affected) {
              throw new HttpException(
                {
                  message:
                    '무료 경기 생성 횟수를 모두 사용했습니다. 구독 후 계속 이용하세요.',
                  code: SUBSCRIPTION_REQUIRED_CODE,
                },
                HttpStatus.PAYMENT_REQUIRED,
              );
            }
          }
        }
      }
```

`subscription.service.ts` — `SubscriptionStatusResponse`에 필드 추가:

```typescript
  monetizationStarted: boolean;
```

import 추가:

```typescript
import { AppSetting } from 'src/entities/AppSetting.entity';
import { MONETIZATION_STARTED_KEY } from '../admin/admin.constants';
```

`getStatus` 본문에 (return 앞):

```typescript
    const monetizationStarted = !!(await this.dataSource
      .getRepository(AppSetting)
      .findOne({ where: { key: MONETIZATION_STARTED_KEY } }));
```

반환 객체에 `monetizationStarted,` 추가.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && pnpm test`
Expected: 전체 PASS (기존 게이팅 테스트 포함)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/modules/game/ backend/src/modules/subscription/
git commit -m "feat: 게이팅을 유료화 시작 이후로 한정하고 관리자 우회 추가"
```

---

### Task 6: 프론트 — role 전파 + 관리자 그룹 전환

**Files:**
- Modify: `frontend/src/app/stores/useAuthStore.ts` (User interface에 role)
- Modify: `frontend/src/app/components/Login.tsx:89-94` (setUser에 role)
- Modify: `frontend/src/app/components/Header.tsx` (onChangeGroup에 관리자 전환)

**Interfaces:**
- Consumes: Task 4의 `POST /admin/switch-group/:groupId` → `{ accessToken, groupId }`; 로그인 응답 `response.data.user.role` (Task 1)
- Produces: `useAuthStore`의 `user.role?: string` — Task 7의 /admin 페이지·설정 메뉴가 사용. 관리자가 헤더 그룹 셀렉터로 그룹을 바꾸면 스코프 토큰으로 교체되어 `canManage`(user.groupId === selectedGroup)가 참이 됨

- [ ] **Step 1: useAuthStore에 role 추가**

`frontend/src/app/stores/useAuthStore.ts`의 `User` interface를:

```typescript
interface User {
  id: string;
  email: string;
  groupId: number;
  accessToken: string;
  role?: string;
}
```

- [ ] **Step 2: Login.tsx에서 role 저장**

`Login.tsx` 89-94행 setUser 호출을:

```typescript
      setUser({
        id: response.data.user.id,
        email: response.data.user.email,
        groupId: response.data.user.groupId,
        accessToken: response.data.accessToken,
        role: response.data.user.role,
      });
```

- [ ] **Step 3: Header.tsx 그룹 전환 로직**

import 추가:

```typescript
import { api } from "@/lib/axios";
import { useQueryClient } from "@tanstack/react-query";
```

컴포넌트 상단에 추가 (기존 `const { user } = useAuthStore...` 아래):

```typescript
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
```

`onChangeGroup`(29-32행)을 다음으로 교체:

```typescript
  const onChangeGroup = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const groupId = Number(e.target.value);
    // 관리자는 그룹 전환 시 해당 그룹 스코프의 토큰을 재발급받아
    // 그 그룹의 데이터 입력 권한(canManage)을 얻는다.
    if (user?.role === "admin" && groupId && groupId !== user.groupId) {
      try {
        const response = await api.post(`/admin/switch-group/${groupId}`);
        localStorage.setItem("token", response.data.accessToken);
        setUser({
          ...user,
          groupId: response.data.groupId,
          accessToken: response.data.accessToken,
        });
        queryClient.clear();
      } catch {
        showToast("그룹 전환에 실패했습니다.", "error");
        return;
      }
    }
    setSelectedGroup(groupId);
    router.push("/");
  };
```

(일반 유저 동작은 기존과 동일 — 전환 API를 타지 않고 조회 전용 selectedGroup만 변경. `useEffect(user → setSelectedGroup(user.groupId))`는 전환 후 user.groupId가 대상 그룹과 같아지므로 무해.)

- [ ] **Step 4: 빌드 검증**

Run: `cd frontend && pnpm build`
Expected: 빌드 성공 (타입 에러 없음)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/app/stores/useAuthStore.ts frontend/src/app/components/Login.tsx frontend/src/app/components/Header.tsx
git commit -m "feat: 프론트에 role 전파 및 관리자 그룹 전환(스코프 토큰) 추가"
```

---

### Task 7: 프론트 — /admin 페이지 + 설정 메뉴 + 배지 게이팅

**Files:**
- Create: `frontend/src/app/admin/page.tsx`
- Create: `frontend/src/app/admin/styles.ts`
- Modify: `frontend/src/app/settings/page.tsx:190-192` 부근 (관리자 메뉴)
- Modify: `frontend/src/app/games/page.tsx:457-464, 753` (배지 게이팅)
- Modify: `frontend/src/app/subscription/page.tsx` (interface + 잔여 표시)

**Interfaces:**
- Consumes: Task 3·4의 `GET /admin/monetization`, `POST /admin/monetization/start`(409), `GET /admin/groups`, `GET /admin/subscriptions`; Task 5의 status 응답 `monetizationStarted`; Task 6의 `user.role`
- Produces: 완성된 관리자 UI (최종 태스크 — 후속 소비자 없음)

- [ ] **Step 1: /admin 페이지 작성**

`frontend/src/app/admin/styles.ts` (subscription/styles.ts와 같은 styled-components 패턴):

```typescript
import styled from "styled-components";

export const Container = styled.div`
  max-width: 720px;
  margin: 0 auto;
  padding: 1.5rem 1rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`;

export const Title = styled.h1`
  font-size: 1.25rem;
  font-weight: 700;
`;

export const Card = styled.section`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1.25rem;
`;

export const CardTitle = styled.h2`
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
`;

export const StatusLine = styled.p`
  font-size: 0.9rem;
  color: #4b5563;
  margin-bottom: 0.75rem;
`;

export const DangerButton = styled.button`
  background: #dc2626;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 0.6rem 1rem;
  font-weight: 600;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  th,
  td {
    text-align: left;
    padding: 0.5rem 0.4rem;
    border-bottom: 1px solid #f3f4f6;
    white-space: nowrap;
  }
  th {
    color: #6b7280;
    font-weight: 600;
  }
`;

export const TableWrap = styled.div`
  overflow-x: auto;
`;

export const Badge = styled.span<{ $tone: "ok" | "warn" | "muted" }>`
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: ${({ $tone }) =>
    $tone === "ok" ? "#dcfce7" : $tone === "warn" ? "#fee2e2" : "#f3f4f6"};
  color: ${({ $tone }) =>
    $tone === "ok" ? "#166534" : $tone === "warn" ? "#991b1b" : "#6b7280"};
`;

export const SmallButton = styled.button`
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0.25rem 0.6rem;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  &:hover {
    background: #e5e7eb;
  }
`;
```

`frontend/src/app/admin/page.tsx` (Toast import 경로는 games/subscription 페이지의 기존 경로를 따른다):

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { useAuthStore } from "@/app/stores/useAuthStore";
import { useGroupStore } from "@/app/stores/groupStore";
import { useToast } from "@/app/components/ui/Toast";
import { useMounted } from "@/app/lib/useMounted";
import * as S from "./styles";

interface Monetization {
  started: boolean;
  startedAt: string | null;
}

interface AdminGroupRow {
  id: number;
  name: string;
  gameCount: number;
  freeGamesUsed: number;
  subscriptionStatus: string;
}

interface SubscriptionOverview {
  statusCounts: { status: string; count: number }[];
  recentPayments: {
    id: number;
    groupName: string;
    amount: number;
    status: string;
    orderId: string;
    paidAt: string | null;
    failReason: string | null;
  }[];
}

const AdminPage = () => {
  const mounted = useMounted();
  const router = useRouter();
  const { user } = useAuthStore((state) => state);
  const setUser = useAuthStore((state) => state.setUser);
  const setSelectedGroup = useGroupStore((state) => state.setSelectedGroup);
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (mounted && !isAdmin) {
      router.replace("/");
    }
  }, [mounted, isAdmin, router]);

  const { data: monetization } = useQuery<Monetization>({
    queryKey: ["admin", "monetization"],
    queryFn: async () => (await api.get("/admin/monetization")).data,
    enabled: mounted && isAdmin,
  });

  const { data: groups } = useQuery<AdminGroupRow[]>({
    queryKey: ["admin", "groups"],
    queryFn: async () => (await api.get("/admin/groups")).data,
    enabled: mounted && isAdmin,
  });

  const { data: overview } = useQuery<SubscriptionOverview>({
    queryKey: ["admin", "subscriptions"],
    queryFn: async () => (await api.get("/admin/subscriptions")).data,
    enabled: mounted && isAdmin,
  });

  const startMutation = useMutation({
    mutationFn: async () => (await api.post("/admin/monetization/start")).data,
    onSuccess: () => {
      showToast("유료화 서비스가 시작되었습니다.", "success");
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
    },
    onError: (error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      if (status === 409) {
        showToast("이미 유료화가 시작되었습니다.", "info");
        queryClient.invalidateQueries({ queryKey: ["admin"] });
      } else {
        showToast("유료화 시작에 실패했습니다.", "error");
      }
    },
  });

  const handleStart = () => {
    const confirmed = window.confirm(
      "유료화 서비스를 시작합니다.\n\n- 모든 그룹의 기존 게임 수가 무료 한도(10회)에 즉시 반영됩니다.\n- 이 작업은 되돌릴 수 없습니다.\n\n계속할까요?",
    );
    if (confirmed) {
      startMutation.mutate();
    }
  };

  // Header의 관리자 그룹 전환과 동일한 흐름 — 스코프 토큰 교체 후 해당 그룹으로 이동
  const handleSwitch = async (groupId: number) => {
    if (!user) return;
    try {
      const response = await api.post(`/admin/switch-group/${groupId}`);
      localStorage.setItem("token", response.data.accessToken);
      setUser({
        ...user,
        groupId: response.data.groupId,
        accessToken: response.data.accessToken,
      });
      queryClient.clear();
      setSelectedGroup(groupId);
      showToast("그룹이 전환되었습니다.", "success");
      router.push("/games");
    } catch {
      showToast("그룹 전환에 실패했습니다.", "error");
    }
  };

  if (!mounted || !isAdmin) return null;

  return (
    <S.Container>
      <S.Title>관리자</S.Title>

      <S.Card>
        <S.CardTitle>유료화 서비스</S.CardTitle>
        {monetization?.started ? (
          <S.StatusLine>
            시작됨 ·{" "}
            {monetization.startedAt
              ? new Date(monetization.startedAt).toLocaleString("ko-KR")
              : "-"}
          </S.StatusLine>
        ) : (
          <>
            <S.StatusLine>
              아직 시작 전입니다. 시작하면 각 그룹의 기존 게임 수가 무료
              한도에 포함되고, 초과 그룹은 구독해야 새 경기를 만들 수
              있습니다.
            </S.StatusLine>
            <S.DangerButton
              onClick={handleStart}
              disabled={startMutation.isPending}
            >
              {startMutation.isPending ? "시작 중..." : "유료화 서비스 시작"}
            </S.DangerButton>
          </>
        )}
      </S.Card>

      <S.Card>
        <S.CardTitle>그룹 현황</S.CardTitle>
        <S.TableWrap>
          <S.Table>
            <thead>
              <tr>
                <th>그룹</th>
                <th>게임 수</th>
                <th>무료 사용</th>
                <th>구독</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(groups ?? []).map((group) => (
                <tr key={group.id}>
                  <td>{group.name}</td>
                  <td>{group.gameCount}</td>
                  <td>{group.freeGamesUsed}</td>
                  <td>
                    {group.subscriptionStatus === "none" ? (
                      <S.Badge $tone="muted">없음</S.Badge>
                    ) : group.subscriptionStatus === "active" ? (
                      <S.Badge $tone="ok">active</S.Badge>
                    ) : (
                      <S.Badge $tone="warn">
                        {group.subscriptionStatus}
                      </S.Badge>
                    )}
                  </td>
                  <td>
                    <S.SmallButton onClick={() => handleSwitch(group.id)}>
                      이 그룹으로 전환
                    </S.SmallButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </S.Table>
        </S.TableWrap>
      </S.Card>

      <S.Card>
        <S.CardTitle>구독·결제 현황</S.CardTitle>
        <S.StatusLine>
          {(overview?.statusCounts ?? [])
            .map((row) => `${row.status} ${row.count}건`)
            .join(" · ") || "구독 없음"}
        </S.StatusLine>
        <S.TableWrap>
          <S.Table>
            <thead>
              <tr>
                <th>그룹</th>
                <th>금액</th>
                <th>상태</th>
                <th>일시</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.recentPayments ?? []).map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.groupName}</td>
                  <td>{payment.amount.toLocaleString("ko-KR")}원</td>
                  <td>
                    {payment.status === "success" ? (
                      <S.Badge $tone="ok">성공</S.Badge>
                    ) : (
                      <S.Badge $tone="warn">실패</S.Badge>
                    )}
                  </td>
                  <td>
                    {payment.paidAt
                      ? new Date(payment.paidAt).toLocaleString("ko-KR")
                      : "-"}
                  </td>
                  <td>{payment.failReason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </S.Table>
        </S.TableWrap>
      </S.Card>
    </S.Container>
  );
};

export default AdminPage;
```

- [ ] **Step 2: 설정 페이지에 관리자 메뉴**

`frontend/src/app/settings/page.tsx` — `구독 관리` 버튼(190-192행) 바로 아래에 추가. 파일 상단에서 `useAuthStore`의 user를 이미 쓰고 있는지 확인하고 없으면 가져온다:

```tsx
        {user?.role === "admin" && (
          <SubscriptionButton onClick={() => router.push("/admin")}>
            관리자 페이지
          </SubscriptionButton>
        )}
```

- [ ] **Step 3: 배지/구독 페이지 게이팅**

`frontend/src/app/games/page.tsx` — useQuery 타입(457-460행)에 필드 추가:

```typescript
  const { data: subStatus } = useQuery<{
    subscribed: boolean;
    remainingFreeGames: number;
    monetizationStarted: boolean;
  }>({
```

753행 배지 조건을:

```tsx
      {subStatus && subStatus.monetizationStarted && !subStatus.subscribed && subStatus.remainingFreeGames <= 3 && (
```

`frontend/src/app/subscription/page.tsx` — status interface에 `monetizationStarted: boolean;` 추가, 무료 잔여 표시(162-165행)를:

```tsx
            <S.StatusLine>
              {status.monetizationStarted
                ? `무료 잔여 경기 생성 ${status.remainingFreeGames}회 / ${status.freeGameLimit}회`
                : "유료화 시작 전 — 경기 생성 무제한"}
            </S.StatusLine>
```

- [ ] **Step 4: 빌드 검증**

Run: `cd frontend && pnpm build`
Expected: 빌드 성공, `/admin` 라우트 포함

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/app/admin/ frontend/src/app/settings/page.tsx frontend/src/app/games/page.tsx frontend/src/app/subscription/page.tsx
git commit -m "feat: 관리자 페이지 신설 및 유료화 시작 전 배지 숨김 처리"
```

---

## 수동 검증 (전체 태스크 완료 후, 사람이 확인)

1. DB에서 관리자 승격: `UPDATE "user" SET role='admin' WHERE email='<관리자 이메일>';` → 재로그인.
2. 설정 → 관리자 페이지 진입, 그룹/구독 현황 표시 확인.
3. 유료화 시작 전: 아무 그룹이나 게임 10개 이상 생성 가능 확인.
4. 유료화 시작 버튼 → 확인 다이얼로그 → 그룹 현황의 무료 사용량이 게임 수로 채워졌는지 확인.
5. 게임 10개 이상인 그룹의 일반 계정으로 신규 생성 → 402 + /subscription 리다이렉트 확인.
6. 관리자로 헤더에서 타 그룹 선택 → teams/games 메뉴 잠금 해제 + 데이터 입력 확인, 게임 생성 시 카운터 미증가 확인.
7. 일반 계정으로 /admin 접근 → 홈 리다이렉트, API 직접 호출 → 403 확인.
