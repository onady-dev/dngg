# 그룹 단위 월/연 구독 결제 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 그룹(팀) 단위 월/연 구독 결제를 토스페이먼츠 빌링키 자동결제로 도입하고, 무료 그룹의 경기 생성을 10회로 제한한다.

**Architecture:** 백엔드에 신규 `subscription` NestJS 모듈을 추가한다. 토스 HTTP 호출은 주입 가능한 `TossBillingClient` 하나로 격리해 mock 테스트가 가능하게 한다. 게이팅은 기존 `game.service.ts`의 저장 트랜잭션 안에서 원자적 카운터 증가로 처리하고, 자동갱신은 `@nestjs/schedule` 크론이 담당한다. 프론트는 신규 `/subscription` 페이지와 axios 402 인터셉터로 대응한다.

**Tech Stack:** NestJS 11 · TypeORM 0.3 · PostgreSQL 15 · `@nestjs/schedule` (신규) · 토스 `@tosspayments/tosspayments-sdk` (프론트 신규) · Next.js 14 App Router · styled-components · TanStack Query · Zustand · Jest.

## Global Constraints

- 설계 문서 원본: `docs/superpowers/specs/2026-07-13-subscription-design.md` — 이 계획과 충돌 시 스펙이 우선.
- `billingKey`는 **어떤 API 응답에도 포함 금지**. `customerKey`는 status 응답에만 포함(SDK 호출용).
- 결제 금액은 **서버 설정값만** 사용. 클라이언트는 `billingCycle`(`'monthly' | 'yearly'`)만 전달, 금액 전달 불가.
- 모든 구독 API는 `AuthGuard('jwt')`, groupId는 `req.user.groupId`만 신뢰 (기존 `assertSameGroup` 패턴).
- request DTO는 전역 `ValidationPipe`(`whitelist` + `forbidNonWhitelisted`)에 맞춰 작성 — 선언 안 된 필드는 거부됨.
- `synchronize: true`이므로 엔티티 변경은 백엔드 재시작 즉시 운영 DB에 반영된다. **배포 전 운영 DB의 `subscription`/`payment` 테이블이 비어 있는지 확인**할 것.
- 백엔드 명령은 `backend/`, 프론트 명령은 `frontend/`에서 실행. 패키지 매니저는 **pnpm**.
- 설정값(backend `.env.dev` / `.env.prod`): `TOSS_SECRET_KEY`, `SUBSCRIPTION_PRICE_MONTHLY`(기본 9900), `SUBSCRIPTION_PRICE_YEARLY`(기본 99000), `FREE_GAME_LIMIT`(기본 10). 프론트: `NEXT_PUBLIC_TOSS_CLIENT_KEY`(빌드 시점 박힘 → 배포 시 이미지 재빌드).
- 유예 기간 = `currentPeriodEnd + 3일` (별도 필드 없음). `GRACE_DAYS = 3` 상수.
- 프론트에는 테스트 러너가 없다 (`frontend/package.json`에 jest 없음). 프론트 태스크의 검증은 `pnpm lint` + `pnpm build` + 수동 확인이다.
- **그룹당 유효 구독 1개 불변식은 2중 방어**: (1) `subscribe` 진입 시 `count` 선체크(결제 전, 흔한 "이미 구독 중" 케이스 차단), (2) `Subscription`의 부분 유니크 인덱스(`uq_active_subscription_per_group`, 동시 요청 레이스 최종 백스톱, 위반 시 409 + 중복 결제분은 수동 환불). Task 1/4 참조.
- **`customerKey`는 `GET /subscription/status`에서 생성·저장될 수 있다**(write-on-GET). 프론트가 결제 전 status로 `customerKey`를 받아 토스 SDK를 호출해야 하므로 의도된 동작이다 (`ensureCustomerKey`는 멱등 — 이미 있으면 재사용).

---

## File Structure

### 백엔드 (생성)

- `backend/src/modules/subscription/subscription.constants.ts` — 상태/주기 타입, 상수, 402 에러 코드.
- `backend/src/modules/subscription/subscription.config.ts` — env 기반 가격/한도 조회 헬퍼.
- `backend/src/modules/subscription/subscription.util.ts` — 기간 계산 순수 함수.
- `backend/src/modules/subscription/toss-billing.client.ts` — 토스 HTTP 클라이언트 (주입 가능).
- `backend/src/modules/subscription/subscription.request.dto.ts` — 요청 DTO.
- `backend/src/modules/subscription/subscription.service.ts` — 상태/구독/해지/갱신 로직.
- `backend/src/modules/subscription/subscription.controller.ts` — 5개 엔드포인트.
- `backend/src/modules/subscription/subscription-renewal.cron.ts` — 크론 트리거.
- `backend/src/modules/subscription/subscription.module.ts` — 모듈 배선.
- 테스트: `*.spec.ts`를 같은 폴더에 둔다 (`subscription.util.spec.ts`, `toss-billing.client.spec.ts`, `subscription.service.spec.ts`, `subscription-renewal.spec.ts`).

### 백엔드 (수정)

- `backend/src/entities/Subscription.entity.ts` — User → Group 기준으로 개편.
- `backend/src/entities/Payment.entity.ts` — group/user/subscription 참조 + orderId unique.
- `backend/src/entities/Group.entity.ts` — `freeGamesUsed`, `customerKey` 컬럼 추가.
- `backend/src/entities/User.entity.ts` — `subscriptions`/`payments` relation 제거.
- `backend/src/app.module.ts` — `ScheduleModule.forRoot()`, `SubscriptionModule` 등록.
- `backend/src/modules/game/game.service.ts` — 게이팅 삽입.
- `backend/src/modules/group/group.service.ts` + `group.controller.ts` + `group.module.ts` — 삭제 시 구독 해지 + 소유권 검증.
- `backend/.env.dev`, `backend/.env.prod`, `backend/.env.example` — 신규 키.

### 프론트엔드

- `frontend/src/lib/axios.ts` — 402 인터셉터 (수정).
- `frontend/src/app/subscription/page.tsx` — 구독 페이지 (생성).
- `frontend/src/app/subscription/styles.ts` — 스타일 (생성).
- `frontend/src/app/settings/page.tsx` — 구독 페이지 진입 링크 (수정).
- `frontend/src/app/games/page.tsx` — 잔여 횟수 배지 (수정).
- `frontend/.env.example` — `NEXT_PUBLIC_TOSS_CLIENT_KEY` (수정).

---

## Task 1: 엔티티 개편 + Group 컬럼

**Files:**
- Modify: `backend/src/entities/Subscription.entity.ts`
- Modify: `backend/src/entities/Payment.entity.ts`
- Modify: `backend/src/entities/Group.entity.ts`
- Modify: `backend/src/entities/User.entity.ts`
- Create: `backend/src/modules/subscription/subscription.constants.ts`

**Interfaces:**
- Produces:
  - `type BillingCycle = 'monthly' | 'yearly'`
  - `type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'expired'`
  - `const ACTIVE_STATUSES: SubscriptionStatus[]` = `['active', 'past_due']`
  - `const SUBSCRIPTION_REQUIRED_CODE = 'SUBSCRIPTION_REQUIRED'`
  - `const GRACE_DAYS = 3`
  - `Subscription` 엔티티: `id, group, billingCycle, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, billingKey, createdAt, updatedAt` + 부분 유니크 인덱스 `uq_active_subscription_per_group`(`group`, `WHERE status IN ('active','past_due')`)
  - `Payment` 엔티티: `id, subscription, group, user, amount, orderId(unique), externalPaymentId, status, failReason, paidAt, createdAt`
  - `Group` 엔티티에 `freeGamesUsed: number`, `customerKey: string | null`

- [ ] **Step 1: 상수 파일 생성**

`backend/src/modules/subscription/subscription.constants.ts`:

```ts
export type BillingCycle = 'monthly' | 'yearly';

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'expired';

// 프리미엄이 유지되는(무제한 통과) 상태
export const ACTIVE_STATUSES: SubscriptionStatus[] = ['active', 'past_due'];

// 갱신 결제 실패 후 유예 일수
export const GRACE_DAYS = 3;

// 402 응답에 실어 보내는 에러 코드 (프론트 인터셉터가 이 값을 감지)
export const SUBSCRIPTION_REQUIRED_CODE = 'SUBSCRIPTION_REQUIRED';
```

- [ ] **Step 2: Subscription 엔티티 개편**

`backend/src/entities/Subscription.entity.ts` 전체를 교체:

```ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Group } from './Group.entity';
import {
  BillingCycle,
  SubscriptionStatus,
} from '../modules/subscription/subscription.constants';

@Entity()
// 그룹당 유효 구독(active/past_due)은 최대 1개 — DB 레벨 불변식.
// count() 선체크는 결제 전 fast-path 가드이고, 이 부분 유니크 인덱스는
// 동시 요청이 그 체크를 통과하는 레이스에 대한 최종 백스톱이다.
// (Postgres 부분 인덱스 — synchronize: true가 생성)
@Index('uq_active_subscription_per_group', ['group'], {
  unique: true,
  where: `status IN ('active', 'past_due')`,
})
export class Subscription {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Group)
  group: Group;

  @Column('varchar')
  billingCycle: BillingCycle;

  @Column('varchar')
  status: SubscriptionStatus;

  @Column('timestamp')
  currentPeriodStart: Date;

  @Column('timestamp')
  currentPeriodEnd: Date;

  @Column('boolean', { default: false })
  cancelAtPeriodEnd: boolean;

  // 토스 발급값 — 어떤 API 응답에도 포함 금지
  @Column('varchar', { nullable: true })
  billingKey: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 3: Payment 엔티티 개편**

`backend/src/entities/Payment.entity.ts` 전체를 교체:

```ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Group } from './Group.entity';
import { User } from './User.entity';
import { Subscription } from './Subscription.entity';

@Entity()
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Subscription, { nullable: true })
  subscription: Subscription;

  @ManyToOne(() => Group)
  group: Group;

  @ManyToOne(() => User, { nullable: true })
  user: User;

  @Column('int')
  amount: number;

  // 멱등성 보장 — 토스 결제 요청 orderId
  @Column('varchar', { unique: true })
  orderId: string;

  // 토스 paymentKey (성공 시)
  @Column('varchar', { nullable: true })
  externalPaymentId: string;

  @Column('varchar')
  status: 'success' | 'failed';

  @Column('varchar', { nullable: true })
  failReason: string;

  @Column('timestamp', { nullable: true })
  paidAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
```

- [ ] **Step 4: Group 엔티티에 컬럼 추가**

`backend/src/entities/Group.entity.ts`를 교체:

```ts
import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
@Entity()
@Unique(['name'])
export class Group {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar', { length: 20 })
  name: string;

  @Column('boolean', { default: false })
  isDeleted: boolean;

  // 무료 경기 생성 누적 횟수 (삭제-재생성 우회 방지 — 감소하지 않음)
  @Column('int', { default: 0 })
  freeGamesUsed: number;

  // 토스 SDK 호출용 무작위 UUID (billingKey와 달리 응답 노출 가능)
  @Column('varchar', { nullable: true })
  customerKey: string;
}
```

- [ ] **Step 5: User 엔티티에서 구독/결제 relation 제거**

`backend/src/entities/User.entity.ts`를 교체:

```ts
import { Column, Entity, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Group } from './Group.entity';
@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;
  @Column('int')
  groupId: number;
  @Column('varchar', { unique: true })
  email: string;
  @Column('varchar')
  password: string;
  @Column('varchar')
  phoneNumber: string;
  @Column('timestamp', { default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @OneToOne(() => Group, (group) => group.id)
  group: Group;
}
```

- [ ] **Step 6: 빌드로 타입/스키마 검증**

Run: `cd backend && pnpm build`
Expected: 에러 없이 완료 (엔티티 순환 import — Subscription→Group, Payment→Subscription/User — 는 TypeORM에서 정상 동작).

- [ ] **Step 7: Commit**

```bash
git add backend/src/entities backend/src/modules/subscription/subscription.constants.ts
git commit -m "feat: refactor subscription/payment entities to group-based, add group counters"
```

---

## Task 2: 기간 계산 유틸 + 설정 헬퍼

**Files:**
- Create: `backend/src/modules/subscription/subscription.util.ts`
- Create: `backend/src/modules/subscription/subscription.config.ts`
- Test: `backend/src/modules/subscription/subscription.util.spec.ts`

**Interfaces:**
- Consumes: `BillingCycle`, `GRACE_DAYS` (Task 1)
- Produces:
  - `addBillingPeriod(from: Date, cycle: BillingCycle): Date`
  - `computeGraceEnd(periodEnd: Date, graceDays?: number): Date`
  - `getPrice(cycle: BillingCycle): number`
  - `getFreeGameLimit(): number`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/modules/subscription/subscription.util.spec.ts`:

```ts
import { addBillingPeriod, computeGraceEnd } from './subscription.util';

describe('subscription.util', () => {
  describe('addBillingPeriod', () => {
    test('monthly는 한 달을 더한다', () => {
      const result = addBillingPeriod(new Date('2026-01-15T00:00:00Z'), 'monthly');
      expect(result.toISOString()).toBe('2026-02-15T00:00:00.000Z');
    });

    test('yearly는 일 년을 더한다', () => {
      const result = addBillingPeriod(new Date('2026-01-15T00:00:00Z'), 'yearly');
      expect(result.toISOString()).toBe('2027-01-15T00:00:00.000Z');
    });

    test('원본 Date를 변경하지 않는다 (불변)', () => {
      const from = new Date('2026-01-15T00:00:00Z');
      addBillingPeriod(from, 'monthly');
      expect(from.toISOString()).toBe('2026-01-15T00:00:00.000Z');
    });
  });

  describe('computeGraceEnd', () => {
    test('기본 3일을 더한다', () => {
      const result = computeGraceEnd(new Date('2026-01-15T00:00:00Z'));
      expect(result.toISOString()).toBe('2026-01-18T00:00:00.000Z');
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pnpm test -- subscription.util.spec.ts`
Expected: FAIL — `Cannot find module './subscription.util'`

- [ ] **Step 3: 유틸 구현**

`backend/src/modules/subscription/subscription.util.ts`:

```ts
import { BillingCycle, GRACE_DAYS } from './subscription.constants';

// from을 변경하지 않고 새 Date를 반환한다.
export function addBillingPeriod(from: Date, cycle: BillingCycle): Date {
  const next = new Date(from.getTime());
  if (cycle === 'yearly') {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
}

// 갱신 실패 유예 종료 시점 = periodEnd + graceDays
export function computeGraceEnd(periodEnd: Date, graceDays = GRACE_DAYS): Date {
  const end = new Date(periodEnd.getTime());
  end.setUTCDate(end.getUTCDate() + graceDays);
  return end;
}
```

- [ ] **Step 4: 설정 헬퍼 구현**

`backend/src/modules/subscription/subscription.config.ts`:

```ts
import { BillingCycle } from './subscription.constants';

const DEFAULT_PRICE_MONTHLY = 9900;
const DEFAULT_PRICE_YEARLY = 99000;
const DEFAULT_FREE_GAME_LIMIT = 10;

// 서버 설정값만 사용 — 클라이언트 금액 조작 불가
export function getPrice(cycle: BillingCycle): number {
  if (cycle === 'yearly') {
    return Number(process.env.SUBSCRIPTION_PRICE_YEARLY ?? DEFAULT_PRICE_YEARLY);
  }
  return Number(process.env.SUBSCRIPTION_PRICE_MONTHLY ?? DEFAULT_PRICE_MONTHLY);
}

export function getFreeGameLimit(): number {
  return Number(process.env.FREE_GAME_LIMIT ?? DEFAULT_FREE_GAME_LIMIT);
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd backend && pnpm test -- subscription.util.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/subscription/subscription.util.ts backend/src/modules/subscription/subscription.config.ts backend/src/modules/subscription/subscription.util.spec.ts
git commit -m "feat: add subscription period util and config helpers"
```

---

## Task 3: 토스 빌링 HTTP 클라이언트

**Files:**
- Create: `backend/src/modules/subscription/toss-billing.client.ts`
- Test: `backend/src/modules/subscription/toss-billing.client.spec.ts`

**Interfaces:**
- Produces:
  - `interface IssueBillingKeyResult { billingKey: string }`
  - `interface TossPaymentResult { paymentKey: string; orderId: string; approvedAt: string }`
  - `class TossBillingClient` (`@Injectable`):
    - `issueBillingKey(authKey: string, customerKey: string): Promise<IssueBillingKeyResult>`
    - `requestBillingPayment(params: { billingKey: string; customerKey: string; amount: number; orderId: string; orderName: string }): Promise<TossPaymentResult>`
  - 두 메서드는 토스가 200이 아니면 `Error(토스 message)`를 던진다.

전역 `fetch`(Node 20+)를 사용하므로 신규 의존성이 없다.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/modules/subscription/toss-billing.client.spec.ts`:

```ts
import { TossBillingClient } from './toss-billing.client';

describe('TossBillingClient', () => {
  const OLD_ENV = process.env.TOSS_SECRET_KEY;

  beforeEach(() => {
    process.env.TOSS_SECRET_KEY = 'test_sk_dummy';
  });

  afterAll(() => {
    process.env.TOSS_SECRET_KEY = OLD_ENV;
    jest.restoreAllMocks();
  });

  test('issueBillingKey는 성공 시 billingKey를 반환한다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ billingKey: 'bk_123' }),
    }) as any;

    const client = new TossBillingClient();
    const result = await client.issueBillingKey('auth_1', 'cust_1');

    expect(result.billingKey).toBe('bk_123');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.tosspayments.com/v1/billing/authorizations/issue',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('requestBillingPayment는 실패 응답 시 토스 메시지로 에러를 던진다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: '카드 한도 초과' }),
    }) as any;

    const client = new TossBillingClient();

    await expect(
      client.requestBillingPayment({
        billingKey: 'bk_1',
        customerKey: 'cust_1',
        amount: 9900,
        orderId: 'ord_1',
        orderName: '월 구독',
      }),
    ).rejects.toThrow('카드 한도 초과');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pnpm test -- toss-billing.client.spec.ts`
Expected: FAIL — `Cannot find module './toss-billing.client'`

- [ ] **Step 3: 클라이언트 구현**

`backend/src/modules/subscription/toss-billing.client.ts`:

```ts
import { Injectable } from '@nestjs/common';

const TOSS_BASE = 'https://api.tosspayments.com';

export interface IssueBillingKeyResult {
  billingKey: string;
}

export interface TossPaymentResult {
  paymentKey: string;
  orderId: string;
  approvedAt: string;
}

@Injectable()
export class TossBillingClient {
  private authHeader(): string {
    const secret = process.env.TOSS_SECRET_KEY ?? '';
    // 토스 규격: "시크릿키:" 를 base64로 인코딩한 Basic 인증
    const encoded = Buffer.from(`${secret}:`).toString('base64');
    return `Basic ${encoded}`;
  }

  private async post(path: string, body: unknown): Promise<any> {
    const res = await fetch(`${TOSS_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.message ?? '토스 API 요청이 실패했습니다.');
    }
    return data;
  }

  async issueBillingKey(
    authKey: string,
    customerKey: string,
  ): Promise<IssueBillingKeyResult> {
    const data = await this.post('/v1/billing/authorizations/issue', {
      authKey,
      customerKey,
    });
    return { billingKey: data.billingKey };
  }

  async requestBillingPayment(params: {
    billingKey: string;
    customerKey: string;
    amount: number;
    orderId: string;
    orderName: string;
  }): Promise<TossPaymentResult> {
    const { billingKey, customerKey, amount, orderId, orderName } = params;
    const data = await this.post(`/v1/billing/${billingKey}`, {
      customerKey,
      amount,
      orderId,
      orderName,
    });
    return {
      paymentKey: data.paymentKey,
      orderId: data.orderId,
      approvedAt: data.approvedAt,
    };
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && pnpm test -- toss-billing.client.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/subscription/toss-billing.client.ts backend/src/modules/subscription/toss-billing.client.spec.ts
git commit -m "feat: add injectable Toss billing HTTP client"
```

---

## Task 4: 구독 서비스 — 상태 조회 + 구독(빌링키 발급 + 첫 결제)

**Files:**
- Create: `backend/src/modules/subscription/subscription.request.dto.ts`
- Create: `backend/src/modules/subscription/subscription.service.ts`
- Test: `backend/src/modules/subscription/subscription.service.spec.ts`

**Interfaces:**
- Consumes: `TossBillingClient` (Task 3), `getPrice`/`getFreeGameLimit` (Task 2), `addBillingPeriod` (Task 2), `ACTIVE_STATUSES`/`BillingCycle` (Task 1), entities (Task 1).
- Produces:
  - `class BillingKeyRequestDto { authKey: string; billingCycle: BillingCycle }`
  - `class SubscriptionService`:
    - `getStatus(groupId: number): Promise<SubscriptionStatusResponse>`
    - `subscribe(groupId: number, userId: number, dto: BillingKeyRequestDto): Promise<{ status: 'active'; currentPeriodEnd: Date }>`
  - `interface SubscriptionStatusResponse { subscribed: boolean; status: SubscriptionStatus | 'none'; billingCycle: BillingCycle | null; currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean; freeGamesUsed: number; freeGameLimit: number; remainingFreeGames: number; customerKey: string; prices: { monthly: number; yearly: number } }`
  - 생성자 시그니처(뒤 태스크가 의존):
    `constructor(subRepo: Repository<Subscription>, payRepo: Repository<Payment>, groupRepo: Repository<Group>, toss: TossBillingClient, dataSource: DataSource)`

- [ ] **Step 1: DTO 작성**

`backend/src/modules/subscription/subscription.request.dto.ts`:

```ts
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { BillingCycle } from './subscription.constants';

export class BillingKeyRequestDto {
  @IsNotEmpty()
  @IsString()
  authKey: string;

  @IsNotEmpty()
  @IsIn(['monthly', 'yearly'])
  billingCycle: BillingCycle;
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`backend/src/modules/subscription/subscription.service.spec.ts`:

```ts
import { ConflictException, HttpException } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';

const GROUP_ID = 1;
const USER_ID = 7;

// dataSource.transaction(cb) 를 즉시 실행하는 가짜 manager로 감싼다.
const makeDataSource = (managerOverrides: any = {}) => {
  const manager = {
    save: jest.fn(async (_entity: any, obj: any) => ({ id: 99, ...obj })),
    update: jest.fn(async () => ({ affected: 1 })),
    ...managerOverrides,
  };
  return {
    manager,
    transaction: jest.fn(async (cb: any) => cb(manager)),
  } as any;
};

const makeService = (opts: {
  group?: any;
  activeCount?: number;
  toss?: any;
  dataSource?: any;
}) => {
  const subRepo = {
    count: jest.fn().mockResolvedValue(opts.activeCount ?? 0),
    findOne: jest.fn().mockResolvedValue(null),
  };
  const payRepo = { save: jest.fn(async (o: any) => o), create: (o: any) => o };
  const groupRepo = {
    findOne: jest.fn().mockResolvedValue(
      opts.group ?? { id: GROUP_ID, freeGamesUsed: 0, customerKey: null },
    ),
    update: jest.fn(async () => ({ affected: 1 })),
  };
  const toss = opts.toss ?? {
    issueBillingKey: jest.fn().mockResolvedValue({ billingKey: 'bk_1' }),
    requestBillingPayment: jest.fn().mockResolvedValue({
      paymentKey: 'pk_1',
      orderId: 'ord_1',
      approvedAt: '2026-07-14T00:00:00Z',
    }),
  };
  const service = new SubscriptionService(
    subRepo as any,
    payRepo as any,
    groupRepo as any,
    toss as any,
    opts.dataSource ?? makeDataSource(),
  );
  return { service, subRepo, payRepo, groupRepo, toss };
};

describe('SubscriptionService.subscribe', () => {
  test('이미 유효 구독이 있으면 ConflictException(409)', async () => {
    const { service, toss } = makeService({ activeCount: 1 });
    await expect(
      service.subscribe(GROUP_ID, USER_ID, {
        authKey: 'a',
        billingCycle: 'monthly',
      }),
    ).rejects.toThrow(ConflictException);
    expect(toss.issueBillingKey).not.toHaveBeenCalled();
  });

  test('성공 시 빌링키 발급 → 첫 결제 → active 구독을 만든다', async () => {
    const { service, toss } = makeService({});
    const result = await service.subscribe(GROUP_ID, USER_ID, {
      authKey: 'a',
      billingCycle: 'monthly',
    });
    expect(toss.issueBillingKey).toHaveBeenCalled();
    expect(toss.requestBillingPayment).toHaveBeenCalledWith(
      expect.objectContaining({ billingKey: 'bk_1', amount: 9900 }),
    );
    expect(result.status).toBe('active');
  });

  test('첫 결제 실패 시 빌링키를 저장하지 않고 실패 응답을 던진다', async () => {
    const toss = {
      issueBillingKey: jest.fn().mockResolvedValue({ billingKey: 'bk_1' }),
      requestBillingPayment: jest.fn().mockRejectedValue(new Error('카드 거절')),
    };
    const { service } = makeService({ toss });
    await expect(
      service.subscribe(GROUP_ID, USER_ID, {
        authKey: 'a',
        billingCycle: 'monthly',
      }),
    ).rejects.toBeInstanceOf(HttpException);
    // 구독 생성 트랜잭션에 진입하지 않았어야 한다 (billingKey 미저장)
  });

  test('동시 요청 레이스로 유니크 위반 시 409 + 환불 대상 Payment 기록', async () => {
    // count 선체크는 통과(0)했지만 트랜잭션 insert가 부분 유니크 인덱스에 걸린다.
    const uniqueError = { driverError: { code: '23505' } };
    const dataSource = {
      transaction: jest.fn().mockRejectedValue(uniqueError),
    } as any;
    const { service, payRepo } = makeService({ dataSource });
    await expect(
      service.subscribe(GROUP_ID, USER_ID, {
        authKey: 'a',
        billingCycle: 'monthly',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    // 결제는 이미 성공했으므로 환불 대상 Payment가 남아야 한다.
    expect(payRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success', failReason: expect.any(String) }),
    );
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd backend && pnpm test -- subscription.service.spec.ts`
Expected: FAIL — `Cannot find module './subscription.service'`

- [ ] **Step 4: 서비스 구현 (getStatus + subscribe)**

`backend/src/modules/subscription/subscription.service.ts`:

```ts
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Subscription } from 'src/entities/Subscription.entity';
import { Payment } from 'src/entities/Payment.entity';
import { Group } from 'src/entities/Group.entity';
import { TossBillingClient } from './toss-billing.client';
import { getFreeGameLimit, getPrice } from './subscription.config';
import { addBillingPeriod } from './subscription.util';
import {
  ACTIVE_STATUSES,
  BillingCycle,
  SubscriptionStatus,
} from './subscription.constants';
import { BillingKeyRequestDto } from './subscription.request.dto';

export interface SubscriptionStatusResponse {
  subscribed: boolean;
  status: SubscriptionStatus | 'none';
  billingCycle: BillingCycle | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  freeGamesUsed: number;
  freeGameLimit: number;
  remainingFreeGames: number;
  customerKey: string;
  prices: { monthly: number; yearly: number };
}

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subRepo: Repository<Subscription>,
    @InjectRepository(Payment)
    private readonly payRepo: Repository<Payment>,
    @InjectRepository(Group)
    private readonly groupRepo: Repository<Group>,
    private readonly toss: TossBillingClient,
    private readonly dataSource: DataSource,
  ) {}

  private async findActiveSubscription(
    groupId: number,
  ): Promise<Subscription | null> {
    return this.subRepo.findOne({
      where: { group: { id: groupId }, status: In(ACTIVE_STATUSES) },
      order: { id: 'DESC' },
    });
  }

  // Group에 저장된 customerKey를 재사용하거나 없으면 생성해 저장한다.
  private async ensureCustomerKey(group: Group): Promise<string> {
    if (group.customerKey) return group.customerKey;
    const customerKey = randomUUID();
    await this.groupRepo.update(group.id, { customerKey });
    return customerKey;
  }

  async getStatus(groupId: number): Promise<SubscriptionStatusResponse> {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    const freeGamesUsed = group?.freeGamesUsed ?? 0;
    const freeGameLimit = getFreeGameLimit();
    const customerKey = group ? await this.ensureCustomerKey(group) : '';
    const active = await this.findActiveSubscription(groupId);

    return {
      subscribed: !!active,
      status: active ? active.status : 'none',
      billingCycle: active ? active.billingCycle : null,
      currentPeriodEnd: active ? active.currentPeriodEnd : null,
      cancelAtPeriodEnd: active ? active.cancelAtPeriodEnd : false,
      freeGamesUsed,
      freeGameLimit,
      remainingFreeGames: Math.max(0, freeGameLimit - freeGamesUsed),
      customerKey,
      prices: { monthly: getPrice('monthly'), yearly: getPrice('yearly') },
    };
  }

  async subscribe(
    groupId: number,
    userId: number,
    dto: BillingKeyRequestDto,
  ): Promise<{ status: 'active'; currentPeriodEnd: Date }> {
    // 그룹당 유효 구독은 1개 — 중복/동시 호출 방지
    const activeCount = await this.subRepo.count({
      where: { group: { id: groupId }, status: In(ACTIVE_STATUSES) },
    });
    if (activeCount > 0) {
      throw new ConflictException('이미 진행 중인 구독이 있습니다.');
    }

    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) {
      throw new HttpException('그룹을 찾을 수 없습니다.', HttpStatus.NOT_FOUND);
    }

    const customerKey = await this.ensureCustomerKey(group);
    const amount = getPrice(dto.billingCycle);
    const orderId = randomUUID();
    const orderName =
      dto.billingCycle === 'yearly' ? 'DNGG 연 구독' : 'DNGG 월 구독';

    // 발급 + 첫 결제는 하나의 단위. 결제 실패 시 빌링키를 저장하지 않는다.
    const { billingKey } = await this.toss.issueBillingKey(
      dto.authKey,
      customerKey,
    );

    let payment;
    try {
      payment = await this.toss.requestBillingPayment({
        billingKey,
        customerKey,
        amount,
        orderId,
        orderName,
      });
    } catch (error) {
      // 실패 이력만 기록 (subscription 미생성, billingKey 미저장)
      await this.payRepo.save(
        this.payRepo.create({
          group: { id: groupId } as Group,
          user: { id: userId } as any,
          amount,
          orderId,
          status: 'failed',
          failReason: error instanceof Error ? error.message : '결제 실패',
        }),
      );
      throw new HttpException(
        error instanceof Error ? error.message : '결제에 실패했습니다.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const now = new Date();
    const currentPeriodEnd = addBillingPeriod(now, dto.billingCycle);

    try {
      await this.dataSource.transaction(async (manager) => {
        const subscription = await manager.save(Subscription, {
          group: { id: groupId } as Group,
          billingCycle: dto.billingCycle,
          status: 'active' as SubscriptionStatus,
          currentPeriodStart: now,
          currentPeriodEnd,
          cancelAtPeriodEnd: false,
          billingKey,
        });
        await manager.save(Payment, {
          subscription,
          group: { id: groupId } as Group,
          user: { id: userId } as any,
          amount,
          orderId,
          externalPaymentId: payment.paymentKey,
          status: 'success',
          paidAt: now,
        });
      });
    } catch (error) {
      // 부분 유니크 인덱스(uq_active_subscription_per_group) 위반 —
      // 선(先) count 체크를 통과한 동시 요청이 여기서 걸린다.
      // 이미 결제는 성공한 상태이므로 성공 Payment는 남기고(위 트랜잭션 롤백으로
      // 미기록일 수 있어 별도 기록) 409로 응답, 중복분 환불은 수동 처리(스코프 제외).
      if (isUniqueViolation(error)) {
        await this.payRepo.save(
          this.payRepo.create({
            group: { id: groupId } as Group,
            user: { id: userId } as any,
            amount,
            orderId,
            externalPaymentId: payment.paymentKey,
            status: 'success',
            paidAt: now,
            failReason: '동시 구독 요청으로 중복 결제 발생 — 환불 대상',
          }),
        );
        throw new ConflictException(
          '이미 진행 중인 구독이 있습니다. 중복 결제는 확인 후 환불됩니다.',
        );
      }
      throw error;
    }

    return { status: 'active', currentPeriodEnd };
  }
}

// Postgres 유니크 제약 위반(23505) 판별. TypeORM QueryFailedError는
// driverError.code에 SQLSTATE를 담는다.
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { driverError?: { code?: string }; code?: string })
    ?.driverError?.code ?? (error as { code?: string })?.code;
  return code === '23505';
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd backend && pnpm test -- subscription.service.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/subscription/subscription.request.dto.ts backend/src/modules/subscription/subscription.service.ts backend/src/modules/subscription/subscription.service.spec.ts
git commit -m "feat: add subscription status and subscribe (billing-key + first payment)"
```

---

## Task 5: 해지 예약 / 재활성화 + 결제 내역

**Files:**
- Modify: `backend/src/modules/subscription/subscription.service.ts`
- Test: `backend/src/modules/subscription/subscription.service.spec.ts` (append)

**Interfaces:**
- Consumes: Task 4의 서비스/레포 구조.
- Produces:
  - `cancel(groupId: number): Promise<{ cancelAtPeriodEnd: true }>`
  - `resume(groupId: number): Promise<{ cancelAtPeriodEnd: false }>`
  - `getPayments(groupId: number, page: number): Promise<{ items: Payment[]; page: number; hasMore: boolean }>`
  - 유효 구독이 없으면 `cancel`/`resume`은 `NotFoundException`.

- [ ] **Step 1: 실패하는 테스트 추가**

`subscription.service.spec.ts` 하단에 append:

```ts
import { NotFoundException } from '@nestjs/common';

describe('SubscriptionService.cancel/resume', () => {
  const makeWithActive = (cancelAtPeriodEnd: boolean) => {
    const sub = { id: 5, cancelAtPeriodEnd };
    const subRepo = {
      count: jest.fn(),
      findOne: jest.fn().mockResolvedValue(sub),
      update: jest.fn(async () => ({ affected: 1 })),
    };
    const service = new SubscriptionService(
      subRepo as any,
      { save: jest.fn() } as any,
      { findOne: jest.fn(), update: jest.fn() } as any,
      {} as any,
      {} as any,
    );
    return { service, subRepo, sub };
  };

  test('cancel은 활성 구독의 cancelAtPeriodEnd를 true로 만든다', async () => {
    const { service, subRepo } = makeWithActive(false);
    const result = await service.cancel(1);
    expect(subRepo.update).toHaveBeenCalledWith(5, {
      cancelAtPeriodEnd: true,
    });
    expect(result.cancelAtPeriodEnd).toBe(true);
  });

  test('활성 구독이 없으면 cancel은 NotFoundException', async () => {
    const subRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    const service = new SubscriptionService(
      subRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await expect(service.cancel(1)).rejects.toThrow(NotFoundException);
  });

  test('resume은 cancelAtPeriodEnd를 false로 되돌린다', async () => {
    const { service, subRepo } = makeWithActive(true);
    const result = await service.resume(1);
    expect(subRepo.update).toHaveBeenCalledWith(5, {
      cancelAtPeriodEnd: false,
    });
    expect(result.cancelAtPeriodEnd).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pnpm test -- subscription.service.spec.ts`
Expected: FAIL — `service.cancel is not a function`

- [ ] **Step 3: 메서드 구현**

`subscription.service.ts`의 `@nestjs/common` import에 `NotFoundException`을 추가:

```ts
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
```

클래스에 메서드 추가:

```ts
  async cancel(groupId: number): Promise<{ cancelAtPeriodEnd: true }> {
    const active = await this.findActiveSubscription(groupId);
    if (!active) {
      throw new NotFoundException('해지할 구독이 없습니다.');
    }
    await this.subRepo.update(active.id, { cancelAtPeriodEnd: true });
    return { cancelAtPeriodEnd: true };
  }

  async resume(groupId: number): Promise<{ cancelAtPeriodEnd: false }> {
    const active = await this.findActiveSubscription(groupId);
    if (!active) {
      throw new NotFoundException('재활성화할 구독이 없습니다.');
    }
    await this.subRepo.update(active.id, { cancelAtPeriodEnd: false });
    return { cancelAtPeriodEnd: false };
  }

  async getPayments(
    groupId: number,
    page = 1,
  ): Promise<{ items: Payment[]; page: number; hasMore: boolean }> {
    const limit = 20;
    const items = await this.payRepo.find({
      where: { group: { id: groupId } },
      order: { id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit + 1,
    });
    const hasMore = items.length > limit;
    return { items: hasMore ? items.slice(0, limit) : items, page, hasMore };
  }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && pnpm test -- subscription.service.spec.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/subscription/subscription.service.ts backend/src/modules/subscription/subscription.service.spec.ts
git commit -m "feat: add subscription cancel, resume, and payment history"
```

---

## Task 6: 컨트롤러 + 모듈 배선

**Files:**
- Create: `backend/src/modules/subscription/subscription.controller.ts`
- Create: `backend/src/modules/subscription/subscription.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `SubscriptionService` (Task 4/5), `TossBillingClient` (Task 3).
- Produces: 5개 라우트 (`GET /subscription/status`, `POST /subscription/billing-key`, `POST /subscription/cancel`, `POST /subscription/resume`, `GET /subscription/payments`). 모두 `AuthGuard('jwt')`, groupId는 `req.user.groupId`.

- [ ] **Step 1: 컨트롤러 작성**

`backend/src/modules/subscription/subscription.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SubscriptionService } from './subscription.service';
import { BillingKeyRequestDto } from './subscription.request.dto';

@Controller('subscription')
@UseGuards(AuthGuard('jwt'))
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('status')
  async getStatus(@Request() req) {
    return this.subscriptionService.getStatus(req.user.groupId);
  }

  @Post('billing-key')
  async createBillingKey(
    @Request() req,
    @Body(ValidationPipe) dto: BillingKeyRequestDto,
  ) {
    return this.subscriptionService.subscribe(
      req.user.groupId,
      req.user.userId,
      dto,
    );
  }

  @Post('cancel')
  async cancel(@Request() req) {
    return this.subscriptionService.cancel(req.user.groupId);
  }

  @Post('resume')
  async resume(@Request() req) {
    return this.subscriptionService.resume(req.user.groupId);
  }

  @Get('payments')
  async getPayments(@Request() req, @Query('page') page?: string) {
    return this.subscriptionService.getPayments(
      req.user.groupId,
      page ? Number(page) : 1,
    );
  }
}
```

- [ ] **Step 2: 모듈 작성**

`backend/src/modules/subscription/subscription.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from 'src/entities/Subscription.entity';
import { Payment } from 'src/entities/Payment.entity';
import { Group } from 'src/entities/Group.entity';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { TossBillingClient } from './toss-billing.client';

@Module({
  imports: [TypeOrmModule.forFeature([Subscription, Payment, Group])],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, TossBillingClient],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
```

- [ ] **Step 3: app.module.ts에 등록**

`backend/src/app.module.ts`:
- import 추가: `import { SubscriptionModule } from './modules/subscription/subscription.module';`
- `imports` 배열의 `TeamModule,` 뒤에 `SubscriptionModule,` 추가.

- [ ] **Step 4: 빌드 + 전체 테스트로 배선 검증**

Run: `cd backend && pnpm build && pnpm test`
Expected: 빌드 성공, 기존 + 신규 테스트 모두 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/subscription/subscription.controller.ts backend/src/modules/subscription/subscription.module.ts backend/src/app.module.ts
git commit -m "feat: wire subscription controller and module"
```

---

## Task 7: 크론 자동갱신 + 실패/유예 처리

**Files:**
- Modify: `backend/src/modules/subscription/subscription.service.ts` (add `renewDueSubscriptions`)
- Create: `backend/src/modules/subscription/subscription-renewal.cron.ts`
- Modify: `backend/src/modules/subscription/subscription.module.ts`
- Modify: `backend/src/app.module.ts` (ScheduleModule)
- Test: `backend/src/modules/subscription/subscription-renewal.spec.ts`

**Interfaces:**
- Consumes: `SubscriptionService`, `addBillingPeriod`/`computeGraceEnd` (Task 2), `getPrice` (Task 2).
- Produces: `renewDueSubscriptions(now: Date): Promise<void>` — `currentPeriodEnd <= now`인 `active`/`past_due` 구독을 처리.
- 신규 의존성: `@nestjs/schedule`.

- [ ] **Step 1: 의존성 설치**

Run: `cd backend && pnpm add @nestjs/schedule`
Expected: `package.json`에 `@nestjs/schedule` 추가.

- [ ] **Step 2: 실패하는 테스트 작성**

`backend/src/modules/subscription/subscription-renewal.spec.ts`:

```ts
import { SubscriptionService } from './subscription.service';

const NOW = new Date('2026-07-14T00:00:00Z');

const makeService = (sub: any, tossOverrides: any = {}) => {
  const subRepo = {
    find: jest.fn().mockResolvedValue([sub]),
    update: jest.fn(async () => ({ affected: 1 })),
  };
  const payRepo = { save: jest.fn(async (o: any) => o), create: (o: any) => o };
  const groupRepo = {};
  const toss = {
    requestBillingPayment: jest.fn().mockResolvedValue({
      paymentKey: 'pk',
      orderId: 'ord',
      approvedAt: NOW.toISOString(),
    }),
    ...tossOverrides,
  };
  // 성공 갱신은 dataSource.transaction 안에서 manager.update/save로 처리한다.
  const manager = {
    update: jest.fn(async () => ({ affected: 1 })),
    save: jest.fn(async (_e: any, o: any) => o),
  };
  const dataSource = { transaction: jest.fn(async (cb: any) => cb(manager)) };
  const service = new SubscriptionService(
    subRepo as any,
    payRepo as any,
    groupRepo as any,
    toss as any,
    dataSource as any,
  );
  return { service, subRepo, toss, manager };
};

describe('SubscriptionService.renewDueSubscriptions', () => {
  const baseSub = {
    id: 1,
    group: { id: 1, customerKey: 'cust_1' },
    billingCycle: 'monthly',
    status: 'active',
    currentPeriodEnd: new Date('2026-07-13T00:00:00Z'),
    cancelAtPeriodEnd: false,
    billingKey: 'bk',
  };

  test('결제 성공 시 기간을 연장하고 active를 유지한다 (트랜잭션 내)', async () => {
    const { service, manager } = makeService({ ...baseSub });
    await service.renewDueSubscriptions(NOW);
    // 첫 인자는 Subscription 엔티티 클래스 — 테스트에서 import 불필요하게 anything()
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ status: 'active' }),
    );
  });

  test('cancelAtPeriodEnd면 결제 없이 canceled로 만든다', async () => {
    const { service, subRepo, toss } = makeService({
      ...baseSub,
      cancelAtPeriodEnd: true,
    });
    await service.renewDueSubscriptions(NOW);
    expect(toss.requestBillingPayment).not.toHaveBeenCalled();
    expect(subRepo.update).toHaveBeenCalledWith(1, { status: 'canceled' });
  });

  test('결제 실패 + 유예 내면 past_due', async () => {
    const { service, subRepo } = makeService(
      { ...baseSub, currentPeriodEnd: new Date('2026-07-13T00:00:00Z') },
      { requestBillingPayment: jest.fn().mockRejectedValue(new Error('실패')) },
    );
    await service.renewDueSubscriptions(NOW); // NOW < 07-16 (유예 종료)
    expect(subRepo.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'past_due' }),
    );
  });

  test('결제 실패 + 유예 초과면 expired', async () => {
    const { service, subRepo } = makeService(
      { ...baseSub, currentPeriodEnd: new Date('2026-07-01T00:00:00Z') },
      { requestBillingPayment: jest.fn().mockRejectedValue(new Error('실패')) },
    );
    await service.renewDueSubscriptions(NOW); // NOW > 07-04 (유예 종료)
    expect(subRepo.update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'expired' }),
    );
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd backend && pnpm test -- subscription-renewal.spec.ts`
Expected: FAIL — `service.renewDueSubscriptions is not a function`

- [ ] **Step 4: renewDueSubscriptions 구현**

`subscription.service.ts` import에 유틸/타입 추가 (기존 import 라인 보강):

```ts
import { DataSource, In, LessThanOrEqual, Repository } from 'typeorm';
import { addBillingPeriod, computeGraceEnd } from './subscription.util';
```

클래스에 메서드 추가:

```ts
  // 크론이 매일 호출. currentPeriodEnd가 지난 유효 구독을 빌링키로 갱신한다.
  async renewDueSubscriptions(now: Date): Promise<void> {
    const due = await this.subRepo.find({
      where: {
        status: In(ACTIVE_STATUSES),
        currentPeriodEnd: LessThanOrEqual(now),
      },
      relations: ['group'],
    });

    for (const sub of due) {
      // 해지 예약된 구독은 기간 만료 시 결제 없이 종료
      if (sub.cancelAtPeriodEnd) {
        await this.subRepo.update(sub.id, { status: 'canceled' });
        continue;
      }

      const amount = getPrice(sub.billingCycle);
      const orderId = randomUUID();
      const orderName =
        sub.billingCycle === 'yearly' ? 'DNGG 연 구독 갱신' : 'DNGG 월 구독 갱신';

      try {
        const payment = await this.toss.requestBillingPayment({
          billingKey: sub.billingKey,
          customerKey: sub.group.customerKey,
          amount,
          orderId,
          orderName,
        });
        // 드리프트 방지: 이전 종료일 기준으로 다음 주기 계산
        const nextEnd = addBillingPeriod(sub.currentPeriodEnd, sub.billingCycle);
        // 기간 연장과 결제 기록은 한 트랜잭션 — 하나만 커밋되어
        // "기간은 늘었는데 결제 기록이 없음" 또는 그 반대가 생기지 않게 한다.
        await this.dataSource.transaction(async (manager) => {
          await manager.update(Subscription, sub.id, {
            status: 'active',
            currentPeriodStart: sub.currentPeriodEnd,
            currentPeriodEnd: nextEnd,
          });
          await manager.save(Payment, {
            subscription: { id: sub.id } as Subscription,
            group: { id: sub.group.id } as Group,
            amount,
            orderId,
            externalPaymentId: payment.paymentKey,
            status: 'success',
            paidAt: now,
          });
        });
      } catch (error) {
        const graceEnd = computeGraceEnd(sub.currentPeriodEnd);
        const nextStatus = now > graceEnd ? 'expired' : 'past_due';
        await this.subRepo.update(sub.id, { status: nextStatus });
        await this.payRepo.save(
          this.payRepo.create({
            subscription: { id: sub.id } as Subscription,
            group: { id: sub.group.id } as Group,
            amount,
            orderId,
            status: 'failed',
            failReason: error instanceof Error ? error.message : '갱신 실패',
          }),
        );
      }
    }
  }
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd backend && pnpm test -- subscription-renewal.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: 크론 트리거 작성**

`backend/src/modules/subscription/subscription-renewal.cron.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionService } from './subscription.service';

@Injectable()
export class SubscriptionRenewalCron {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // 매일 새벽 4시(서버 시각) 1회. 단일 인스턴스이므로 중복 실행 없음.
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async handleRenewal(): Promise<void> {
    await this.subscriptionService.renewDueSubscriptions(new Date());
  }
}
```

- [ ] **Step 7: 모듈에 크론 등록**

`subscription.module.ts`의 `providers`에 `SubscriptionRenewalCron` 추가하고 import:

```ts
import { SubscriptionRenewalCron } from './subscription-renewal.cron';
// providers: [SubscriptionService, TossBillingClient, SubscriptionRenewalCron],
```

`app.module.ts`에 `ScheduleModule` 등록:
- import 추가: `import { ScheduleModule } from '@nestjs/schedule';`
- `imports` 배열 맨 앞(ConfigModule 뒤)에 `ScheduleModule.forRoot(),` 추가.

- [ ] **Step 8: 빌드 + 전체 테스트**

Run: `cd backend && pnpm build && pnpm test`
Expected: 빌드 성공, 전체 테스트 PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/subscription/subscription.service.ts backend/src/modules/subscription/subscription-renewal.cron.ts backend/src/modules/subscription/subscription.module.ts backend/src/modules/subscription/subscription-renewal.spec.ts backend/src/app.module.ts backend/package.json backend/pnpm-lock.yaml
git commit -m "feat: add daily cron for subscription auto-renewal with grace handling"
```

---

## Task 8: 경기 생성 게이팅 (402, 신규 생성만 · 원자적 카운터)

**Files:**
- Modify: `backend/src/modules/game/game.service.ts`
- Test: `backend/src/modules/game/game.service.gating.spec.ts` (create)

**Interfaces:**
- Consumes: `Subscription` 엔티티, `ACTIVE_STATUSES`/`SUBSCRIPTION_REQUIRED_CODE` (Task 1), `getFreeGameLimit` (Task 2).
- Produces: `GameService.saveGameAndLogs`가 신규 생성(`!dto.id`)이고 구독 없고 한도 초과면 `HttpException({ code: 'SUBSCRIPTION_REQUIRED' }, 402)`. 통과 시 같은 트랜잭션에서 `freeGamesUsed` 원자적 증가.

> `game.service.ts`는 이미 `DataSource`를 주입받고 트랜잭션을 사용하므로 신규 주입은 없다. 구독 조회/카운터 증가는 `queryRunner.manager`로 수행한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/modules/game/game.service.gating.spec.ts`:

```ts
import { ForbiddenException, HttpException } from '@nestjs/common';
import { GameService } from './game.service';

// saveGameAndLogs 게이팅 경로만 검증. 소유권/저장 로직은 group-access.spec에서 커버.
const OWN_GROUP = 1;

const makeDto = (overrides: any = {}) => ({
  groupId: OWN_GROUP,
  homeTeamName: 'home',
  awayTeamName: 'away',
  homePlayers: [],
  awayPlayers: [],
  logs: [],
  ...overrides,
});

// queryRunner.manager를 제어 가능한 스텁으로 구성한다.
const makeService = (opts: {
  activeSubCount: number;
  incrementAffected: number;
}) => {
  const manager = {
    // 구독 존재 여부 count
    count: jest.fn().mockResolvedValue(opts.activeSubCount),
    // 원자적 UPDATE ... WHERE freeGamesUsed < limit
    createQueryBuilder: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: opts.incrementAffected }),
    }),
    getRepository: jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue({ id: 55 }),
    }),
  };
  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager,
  };
  const dataSource = {
    createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    getRepository: jest.fn().mockReturnValue({
      count: jest.fn().mockResolvedValue(1), // assertIdsInGroup 통과용 (id 없음이면 no-op)
    }),
  };
  const gameRepository = {
    findOne: jest.fn().mockResolvedValue({ id: 55, groupId: OWN_GROUP }),
    saveGame: jest.fn().mockResolvedValue({ id: 55 }),
  };
  const inGamePlayersRepository = {
    emptyInGamePlayers: jest.fn(),
    saveInGamePlayers: jest.fn(),
  };
  const logRepository = { emptyLog: jest.fn(), saveLog: jest.fn() };
  const service = new GameService(
    gameRepository as any,
    inGamePlayersRepository as any,
    logRepository as any,
    dataSource as any,
  );
  return { service, queryRunner, manager };
};

describe('GameService 게이팅', () => {
  test('신규 생성 + 구독 없음 + 한도 초과면 402 SUBSCRIPTION_REQUIRED', async () => {
    const { service, queryRunner } = makeService({
      activeSubCount: 0,
      incrementAffected: 0, // WHERE freeGamesUsed < limit 에 걸리는 행 없음
    });
    try {
      await service.saveGameAndLogs(makeDto(), OWN_GROUP);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(402);
      expect((e as HttpException).getResponse()).toMatchObject({
        code: 'SUBSCRIPTION_REQUIRED',
      });
    }
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });

  test('구독 있으면 카운터 증가 없이 통과', async () => {
    const { service, manager } = makeService({
      activeSubCount: 1,
      incrementAffected: 1,
    });
    await service.saveGameAndLogs(makeDto(), OWN_GROUP);
    expect(manager.createQueryBuilder).not.toHaveBeenCalled();
  });

  test('기존 게임 수정(dto.id 있음)은 게이팅/카운터를 건너뛴다', async () => {
    const { service, manager } = makeService({
      activeSubCount: 0,
      incrementAffected: 0,
    });
    await service.saveGameAndLogs(makeDto({ id: 55 }), OWN_GROUP);
    expect(manager.count).not.toHaveBeenCalled();
    expect(manager.createQueryBuilder).not.toHaveBeenCalled();
  });

  test('신규 생성 시 dto.groupId가 토큰 groupId와 다르면 403', async () => {
    const { service, manager } = makeService({
      activeSubCount: 0,
      incrementAffected: 1,
    });
    await expect(
      service.saveGameAndLogs(makeDto({ groupId: 2 }), OWN_GROUP),
    ).rejects.toThrow(ForbiddenException);
    // 불일치는 카운터 소비 전에 차단되어야 한다.
    expect(manager.count).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pnpm test -- game.service.gating.spec.ts`
Expected: FAIL — 402가 던져지지 않음 (게이팅 미구현).

- [ ] **Step 3: 게이팅 구현**

`game.service.ts` import 추가/보강:

```ts
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { Subscription } from 'src/entities/Subscription.entity';
import { Group } from 'src/entities/Group.entity';
import {
  ACTIVE_STATUSES,
  SUBSCRIPTION_REQUIRED_CODE,
} from '../subscription/subscription.constants';
import { getFreeGameLimit } from '../subscription/subscription.config';
```

기존 `src/common/group-access` import에 `assertSameGroup`을 추가한다 (현재
`assertIdsInGroup, findOwnedGame`만 import 중):

```ts
import { assertIdsInGroup, assertSameGroup, findOwnedGame } from 'src/common/group-access';
```

`saveGameAndLogs` 안에서 `startTransaction()` 직후, 구조분해(`const { id, groupId, ... } = dto;`) 전에 게이팅 블록을 삽입한다:

```ts
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // 게이팅: 신규 생성(!dto.id)에만 적용. 기존 게임 수정은 통과.
      if (!dto.id) {
        // 카운터/저장 groupId 일관성: 게이팅은 신뢰 값(userGroupId)으로
        // 세는데 게임은 dto.groupId로 저장되므로, 둘이 다르면 A 그룹 한도를
        // 소비하고 B 그룹에 게임을 만드는 우회가 가능하다. 신규 생성 시 일치 강제.
        assertSameGroup(userGroupId, dto.groupId);
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

      const {
        id,
        groupId,
        // ...기존 구조분해/저장 로직 그대로 유지
```

> 나머지 저장 로직은 변경 없음. 402가 던져지면 기존 `catch`가 `rollbackTransaction()`을 호출하므로 카운터 증가도 함께 롤백된다. `userGroupId`는 `saveGameAndLogs(dto, userGroupId)`의 두 번째 매개변수다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && pnpm test -- game.service.gating.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 기존 게임 테스트 회귀 확인**

Run: `cd backend && pnpm test -- game.service.group-access.spec.ts`
Expected: PASS (기존 테스트 무회귀).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/game/game.service.ts backend/src/modules/game/game.service.gating.spec.ts
git commit -m "feat: gate new game creation on free-game limit with atomic counter"
```

---

## Task 9: 그룹 삭제 시 구독 해지 + DELETE 소유권 검증

**Files:**
- Modify: `backend/src/modules/subscription/subscription.service.ts` (add `cancelForGroup`)
- Modify: `backend/src/modules/group/group.service.ts`
- Modify: `backend/src/modules/group/group.controller.ts`
- Modify: `backend/src/modules/group/group.module.ts`
- Test: `backend/src/modules/group/group.service.spec.ts` (create)

**Interfaces:**
- Consumes: `SubscriptionService` (Task 6, exported), `assertSameGroup` (`src/common/group-access`).
- Produces:
  - `SubscriptionService.cancelForGroup(groupId: number): Promise<void>`
  - `GroupService.deleteGroup(id: number, userGroupId: number)` — `assertSameGroup` 후 구독 해지 + soft delete.

- [ ] **Step 1: SubscriptionService에 즉시 해지 메서드 추가**

`subscription.service.ts` 클래스에 추가:

```ts
  // 그룹 삭제 시 호출 — 유효 구독을 즉시 종료하고 자동결제를 중단한다.
  // 주의: repository.update()의 중첩 relation where({ group: { id } })는
  // TypeORM에서 신뢰할 수 없어(조용히 no-op 되면 삭제된 그룹에 크론이 계속
  // 청구) QueryBuilder로 FK 컬럼(groupId)을 직접 지정한다.
  async cancelForGroup(groupId: number): Promise<void> {
    await this.subRepo
      .createQueryBuilder()
      .update(Subscription)
      .set({ status: 'canceled', cancelAtPeriodEnd: true })
      .where('"groupId" = :groupId AND status IN (:...statuses)', {
        groupId,
        statuses: ACTIVE_STATUSES,
      })
      .execute();
  }
```

- [ ] **Step 1b: cancelForGroup 자체 테스트 추가**

Task 9의 `group.service.spec.ts`는 `cancelForGroup`을 mock하므로 이 메서드의 실제
쿼리 동작을 검증하지 못한다 — `subscription.service.spec.ts`에 별도로 추가:

```ts
describe('SubscriptionService.cancelForGroup', () => {
  test('groupId FK로 유효 구독을 canceled 처리하는 쿼리를 실행한다', async () => {
    const execute = jest.fn().mockResolvedValue({ affected: 1 });
    const where = jest.fn().mockReturnValue({ execute });
    const set = jest.fn().mockReturnValue({ where });
    const update = jest.fn().mockReturnValue({ set });
    const subRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({ update }),
    };
    const service = new SubscriptionService(
      subRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await service.cancelForGroup(1);
    expect(set).toHaveBeenCalledWith({
      status: 'canceled',
      cancelAtPeriodEnd: true,
    });
    // 중첩 relation이 아닌 FK 컬럼 조건이어야 한다.
    expect(where).toHaveBeenCalledWith(
      expect.stringContaining('"groupId" = :groupId'),
      expect.objectContaining({ groupId: 1 }),
    );
    expect(execute).toHaveBeenCalled();
  });
});
```

Run: `cd backend && pnpm test -- subscription.service.spec.ts`
Expected: 기존 + 신규 테스트 PASS.

- [ ] **Step 2: 실패하는 테스트 작성**

`backend/src/modules/group/group.service.spec.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import { GroupService } from './group.service';

const OWN_GROUP = 1;
const OTHER_GROUP = 2;

const makeService = () => {
  const groupRepository = {
    softDeleteById: jest.fn().mockResolvedValue(undefined),
  };
  const subscriptionService = {
    cancelForGroup: jest.fn().mockResolvedValue(undefined),
  };
  const service = new GroupService(
    groupRepository as any,
    subscriptionService as any,
  );
  return { service, groupRepository, subscriptionService };
};

describe('GroupService.deleteGroup', () => {
  test('다른 그룹을 삭제하려 하면 ForbiddenException', async () => {
    const { service, groupRepository } = makeService();
    await expect(
      service.deleteGroup(OTHER_GROUP, OWN_GROUP),
    ).rejects.toThrow(ForbiddenException);
    expect(groupRepository.softDeleteById).not.toHaveBeenCalled();
  });

  test('내 그룹 삭제 시 구독을 해지하고 soft delete 한다', async () => {
    const { service, groupRepository, subscriptionService } = makeService();
    await service.deleteGroup(OWN_GROUP, OWN_GROUP);
    expect(subscriptionService.cancelForGroup).toHaveBeenCalledWith(OWN_GROUP);
    expect(groupRepository.softDeleteById).toHaveBeenCalledWith(OWN_GROUP);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd backend && pnpm test -- group.service.spec.ts`
Expected: FAIL — `deleteGroup`이 2번째 인자를 받지 않음 / ForbiddenException 미발생.

- [ ] **Step 4: GroupService 수정**

`backend/src/modules/group/group.service.ts` 전체를 교체:

```ts
import { Injectable } from '@nestjs/common';
import { GroupRepository } from 'src/repository/group.repository';
import { PostGroupRequestDto } from './group.request.dto';
import { plainToInstance } from 'class-transformer';
import { Group } from 'src/entities/Group.entity';
import { assertSameGroup } from 'src/common/group-access';
import { SubscriptionService } from '../subscription/subscription.service';

@Injectable()
export class GroupService {
  constructor(
    private readonly groupRepository: GroupRepository,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async getGroupByName(name: string) {
    return this.groupRepository.findByName(name);
  }

  async createGroup(group: PostGroupRequestDto) {
    const groupInstance = plainToInstance(Group, group);
    return this.groupRepository.createGroup(groupInstance);
  }

  async getAllGroups() {
    return this.groupRepository.findAll();
  }

  async deleteGroup(id: number, userGroupId: number) {
    // 본인 소속 그룹만 삭제 가능 (결제 중인 타 그룹 삭제 방지)
    assertSameGroup(userGroupId, id);
    // 자동결제 중단 — 삭제된 그룹에 크론이 계속 청구하지 않도록
    await this.subscriptionService.cancelForGroup(id);
    await this.groupRepository.softDeleteById(id);
    return { id, isDeleted: true };
  }
}
```

- [ ] **Step 5: 컨트롤러 수정**

`backend/src/modules/group/group.controller.ts`의 import에 `Request` 추가:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Request,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
```

`deleteGroup` 핸들러를 교체:

```ts
  @Delete('/:id')
  @UseGuards(AuthGuard('jwt'))
  async deleteGroup(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.groupService.deleteGroup(id, req.user.groupId);
  }
```

- [ ] **Step 6: 모듈에 SubscriptionModule import**

`backend/src/modules/group/group.module.ts`의 `imports`에 `SubscriptionModule` 추가:

```ts
import { SubscriptionModule } from '../subscription/subscription.module';
// imports: [ TypeOrmModule.forFeature([Game, Logitem, Player, Group]), SubscriptionModule ],
```

- [ ] **Step 7: 테스트 통과 + 전체 회귀**

Run: `cd backend && pnpm test -- group.service.spec.ts && pnpm build`
Expected: PASS + 빌드 성공.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/group backend/src/modules/subscription/subscription.service.ts
git commit -m "feat: cancel subscription on group delete and enforce group ownership"
```

---

## Task 10: 프론트 402 인터셉터

**Files:**
- Modify: `frontend/src/lib/axios.ts`

**Interfaces:**
- Consumes: `setPendingToast`/`showGlobalToast` (`@/lib/toastBus`), 백엔드 402 응답 `{ code: 'SUBSCRIPTION_REQUIRED' }`.
- Produces: 402 + 해당 코드 감지 시 `/subscription`으로 이동/토스트.

- [ ] **Step 1: 응답 인터셉터에 402 처리 추가**

`frontend/src/lib/axios.ts`의 응답 인터셉터 error 핸들러에서 기존 401 블록 **뒤**, `return Promise.reject(error);` **앞**에 추가:

```ts
    // 무료 한도 초과 — 백엔드가 402 + code로 알린다.
    const isSubscriptionRequired =
      error.response?.status === 402 &&
      error.response?.data?.code === "SUBSCRIPTION_REQUIRED";
    if (isBrowser() && isSubscriptionRequired) {
      const message = "무료 횟수를 모두 사용했어요. 구독 후 계속 이용하세요.";
      if (window.location.pathname === "/subscription") {
        showGlobalToast(message, "info");
      } else {
        setPendingToast(message, "info");
        window.location.href = "/subscription";
      }
    }
```

- [ ] **Step 2: 린트 + 빌드 검증**

Run: `cd frontend && pnpm lint && pnpm build`
Expected: 에러 없음.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/axios.ts
git commit -m "feat: redirect to /subscription on 402 SUBSCRIPTION_REQUIRED"
```

---

## Task 11: 프론트 구독 페이지 + 토스 SDK

**Files:**
- Create: `frontend/src/app/subscription/styles.ts`
- Create: `frontend/src/app/subscription/page.tsx`
- Modify: `frontend/src/app/settings/page.tsx` (진입 링크)
- Modify: `frontend/.env.example`

**Interfaces:**
- Consumes: `GET /subscription/status`, `POST /subscription/billing-key`, `POST /subscription/cancel`, `POST /subscription/resume` (Task 6), 토스 SDK `@tosspayments/tosspayments-sdk`, `NEXT_PUBLIC_TOSS_CLIENT_KEY`.
- Produces: `/subscription` 라우트.

- [ ] **Step 1: 토스 SDK 설치**

Run: `cd frontend && pnpm add @tosspayments/tosspayments-sdk`
Expected: `package.json`에 추가.

- [ ] **Step 2: 스타일 작성**

`frontend/src/app/subscription/styles.ts`:

```ts
import styled from "styled-components";

export const Container = styled.div`
  max-width: 480px;
  margin: calc(var(--header-height) + 28px) auto 0;
  padding: 0 1rem 3rem;
`;

export const Card = styled.div`
  background: white;
  border: 1px solid var(--border-color);
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  margin-bottom: 1rem;
`;

export const Title = styled.h2`
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 1rem;
`;

export const StatusLine = styled.p`
  font-size: 0.95rem;
  color: #374151;
  margin-bottom: 0.5rem;
`;

export const PlanRow = styled.div`
  display: flex;
  gap: 0.75rem;
  margin: 1rem 0;
`;

export const PlanButton = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: 1rem;
  border-radius: 0.5rem;
  border: 2px solid ${(p) => (p.$active ? "var(--accent-color, #2563eb)" : "#e5e7eb")};
  background: ${(p) => (p.$active ? "rgba(37,99,235,0.06)" : "white")};
  font-weight: 600;
  cursor: pointer;
`;

export const PrimaryButton = styled.button`
  width: 100%;
  padding: 0.9rem;
  border-radius: 0.5rem;
  border: none;
  background: var(--accent-color, #2563eb);
  color: white;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

export const SecondaryButton = styled.button`
  width: 100%;
  padding: 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid #d1d5db;
  background: white;
  font-weight: 600;
  cursor: pointer;
  margin-top: 0.5rem;
`;

export const PaymentItem = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 0.6rem 0;
  border-bottom: 1px solid #f3f4f6;
  font-size: 0.9rem;
`;
```

- [ ] **Step 3: 페이지 작성**

`frontend/src/app/subscription/page.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { showGlobalToast } from "@/lib/toastBus";
import * as S from "./styles";

type BillingCycle = "monthly" | "yearly";

interface StatusResponse {
  subscribed: boolean;
  status: "none" | "active" | "past_due" | "canceled" | "expired";
  billingCycle: BillingCycle | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  freeGamesUsed: number;
  freeGameLimit: number;
  remainingFreeGames: number;
  customerKey: string;
  prices: { monthly: number; yearly: number };
}

interface PaymentsResponse {
  items: Array<{
    id: number;
    amount: number;
    status: "success" | "failed";
    paidAt: string | null;
    createdAt: string;
  }>;
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export default function SubscriptionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  const { data: status, isLoading } = useQuery<StatusResponse>({
    queryKey: ["subscription", "status"],
    queryFn: async () => (await api.get("/subscription/status")).data,
  });

  const { data: payments } = useQuery<PaymentsResponse>({
    queryKey: ["subscription", "payments"],
    queryFn: async () => (await api.get("/subscription/payments")).data,
    enabled: !!status?.subscribed,
  });

  const subscribeMutation = useMutation({
    mutationFn: async (params: { authKey: string; billingCycle: BillingCycle }) =>
      (await api.post("/subscription/billing-key", params)).data,
    onSuccess: () => {
      showGlobalToast("구독이 시작되었습니다.", "success");
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      router.replace("/subscription");
    },
    onError: (e: any) => {
      showGlobalToast(
        e?.response?.data?.message ?? "결제에 실패했습니다.",
        "error",
      );
      router.replace("/subscription");
    },
  });

  // 토스 리다이렉트 복귀: authKey가 있으면 빌링키 발급 + 첫 결제
  useEffect(() => {
    const authKey = searchParams.get("authKey");
    const returnedCycle =
      (searchParams.get("cycle") as BillingCycle) ?? "monthly";
    if (authKey && !subscribeMutation.isPending) {
      subscribeMutation.mutate({ authKey, billingCycle: returnedCycle });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const cancelMutation = useMutation({
    mutationFn: async () => (await api.post("/subscription/cancel")).data,
    onSuccess: () => {
      showGlobalToast("해지가 예약되었습니다.", "info");
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => (await api.post("/subscription/resume")).data,
    onSuccess: () => {
      showGlobalToast("구독이 유지됩니다.", "success");
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
    },
  });

  const startBillingAuth = async () => {
    if (!status) return;
    const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
    if (!clientKey) {
      showGlobalToast("결제 설정이 누락되었습니다.", "error");
      return;
    }
    const tossPayments = await loadTossPayments(clientKey);
    const payment = tossPayments.payment({ customerKey: status.customerKey });
    await payment.requestBillingAuth({
      method: "CARD",
      successUrl: `${window.location.origin}/subscription?cycle=${cycle}`,
      failUrl: `${window.location.origin}/subscription?fail=1`,
    });
  };

  if (isLoading || !status) {
    return (
      <S.Container>
        <S.Card>불러오는 중…</S.Card>
      </S.Container>
    );
  }

  const periodEndText = status.currentPeriodEnd
    ? new Date(status.currentPeriodEnd).toLocaleDateString("ko-KR")
    : null;

  return (
    <S.Container>
      <S.Card>
        <S.Title>구독</S.Title>
        {status.subscribed ? (
          <>
            {status.status === "past_due" && (
              <S.StatusLine>
                결제에 실패했습니다. 카드 상태를 확인해 주세요 (유예 기간 중).
              </S.StatusLine>
            )}
            <S.StatusLine>
              {status.cancelAtPeriodEnd
                ? `해지 예약됨 · ${periodEndText}까지 이용 가능`
                : `구독 중 · 다음 결제일 ${periodEndText}`}
            </S.StatusLine>
            {status.cancelAtPeriodEnd ? (
              <S.SecondaryButton
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending}
              >
                해지 취소
              </S.SecondaryButton>
            ) : (
              <S.SecondaryButton
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
              >
                구독 해지
              </S.SecondaryButton>
            )}
          </>
        ) : (
          <>
            <S.StatusLine>
              무료 잔여 경기 생성 {status.remainingFreeGames}회 /{" "}
              {status.freeGameLimit}회
            </S.StatusLine>
            <S.PlanRow>
              <S.PlanButton
                $active={cycle === "monthly"}
                onClick={() => setCycle("monthly")}
              >
                월 {won(status.prices.monthly)}
              </S.PlanButton>
              <S.PlanButton
                $active={cycle === "yearly"}
                onClick={() => setCycle("yearly")}
              >
                연 {won(status.prices.yearly)}
              </S.PlanButton>
            </S.PlanRow>
            <S.PrimaryButton
              onClick={startBillingAuth}
              disabled={subscribeMutation.isPending}
            >
              {subscribeMutation.isPending ? "처리 중…" : "구독하기"}
            </S.PrimaryButton>
          </>
        )}
      </S.Card>

      {status.subscribed && payments && payments.items.length > 0 && (
        <S.Card>
          <S.Title>결제 내역</S.Title>
          {payments.items.map((p) => (
            <S.PaymentItem key={p.id}>
              <span>
                {new Date(p.paidAt ?? p.createdAt).toLocaleDateString("ko-KR")}
              </span>
              <span>
                {won(p.amount)} · {p.status === "success" ? "완료" : "실패"}
              </span>
            </S.PaymentItem>
          ))}
        </S.Card>
      )}
    </S.Container>
  );
}
```

- [ ] **Step 4: 설정 페이지에 진입 링크 추가**

`frontend/src/app/settings/page.tsx`에 구독 페이지 이동 수단을 추가한다. 파일 상단에 `import { useRouter } from "next/navigation";`가 없으면 추가하고, 컴포넌트 함수 본문 상단에 `const router = useRouter();`를 선언한 뒤, 로그인 사용자에게 보이는 계정 카드 영역(예: `ButtonRow` 근처)에 기존 스타일 버튼을 재사용해 버튼을 추가한다:

```tsx
        <button onClick={() => router.push("/subscription")}>구독 관리</button>
```

> 목적은 로그인 사용자가 `/subscription`으로 이동할 수 있는 것. 실제 마크업은 설정 페이지의 기존 버튼 컴포넌트 스타일에 맞춰 배치한다.

- [ ] **Step 5: env 예시 갱신**

`frontend/.env.example`에 추가:

```
# 토스페이먼츠 클라이언트 키 (빌드 시점에 박힘 — 변경 시 이미지 재빌드 필요)
NEXT_PUBLIC_TOSS_CLIENT_KEY=test_ck_xxxxxxxxxxxxx
```

- [ ] **Step 6: 린트 + 빌드 검증**

Run: `cd frontend && pnpm lint && pnpm build`
Expected: 에러 없음. (`useSearchParams`는 Next.js 14에서 Suspense 경고가 나올 수 있음 — 필요 시 페이지를 `<Suspense>`로 감싼 래퍼 컴포넌트로 분리.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/subscription frontend/src/app/settings/page.tsx frontend/.env.example frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat: add subscription page with Toss billing auth flow"
```

---

## Task 12: 경기 생성 화면 잔여 횟수 배지

**Files:**
- Modify: `frontend/src/app/games/page.tsx`

**Interfaces:**
- Consumes: `GET /subscription/status`의 `remainingFreeGames`/`subscribed`.
- Produces: 구독 안 했고 잔여가 적을 때(≤3) 경기 생성 UI 근처에 배지 표시.

- [ ] **Step 1: 상태 조회 추가**

`frontend/src/app/games/page.tsx`에 TanStack Query import가 없으면 `import { useQuery } from "@tanstack/react-query";`를 추가하고 (`api`는 이미 import되어 있음 — `frontend/src/app/games/page.tsx:573`에서 사용 중), 컴포넌트 내부에:

```tsx
  const { data: subStatus } = useQuery<{
    subscribed: boolean;
    remainingFreeGames: number;
  }>({
    queryKey: ["subscription", "status"],
    queryFn: async () => (await api.get("/subscription/status")).data,
  });
```

- [ ] **Step 2: 배지 렌더링**

경기 저장(생성) 버튼 근처에 조건부 배지 추가:

```tsx
  {subStatus && !subStatus.subscribed && subStatus.remainingFreeGames <= 3 && (
    <span style={{ fontSize: "0.85rem", color: "#b45309" }}>
      무료 경기 생성 {subStatus.remainingFreeGames}회 남음
    </span>
  )}
```

- [ ] **Step 3: 린트 + 빌드 검증**

Run: `cd frontend && pnpm lint && pnpm build`
Expected: 에러 없음.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/games/page.tsx
git commit -m "feat: show remaining free-game badge on game creation"
```

---

## Task 13: 백엔드 env 템플릿 + 배포 노트

**Files:**
- Modify: `backend/.env.example`
- Modify: `backend/.env.dev` (로컬 개발용 — 시크릿이므로 커밋 여부 확인)

**Interfaces:**
- Produces: 신규 설정 키 문서화.

- [ ] **Step 1: backend/.env.example 갱신**

`backend/.env.example`에 추가:

```
# 토스페이먼츠 시크릿 키 (서버 전용 — 절대 프론트 노출 금지)
TOSS_SECRET_KEY=test_sk_xxxxxxxxxxxxx
# 구독 가격 (원) — 기존 구독자의 다음 갱신 금액도 이 값으로 청구됨
SUBSCRIPTION_PRICE_MONTHLY=9900
SUBSCRIPTION_PRICE_YEARLY=99000
# 무료 그룹 경기 생성 한도
FREE_GAME_LIMIT=10
```

- [ ] **Step 2: 로컬 .env.dev에 토스 테스트 키 설정 (시크릿 — 커밋 금지 확인)**

`backend/.env.dev`에 위 키를 토스 대시보드의 **테스트 키**로 채운다.

Run: `cd backend && git check-ignore .env.dev && echo "ignored — safe" || echo "TRACKED — 시크릿 커밋 금지, .gitignore에 추가할 것"`
Expected: `.env.dev`가 무시 목록에 있어야 함. tracked라면 시크릿을 커밋하지 말 것.

- [ ] **Step 3: Commit (예시 파일만)**

```bash
git add backend/.env.example
git commit -m "docs: add subscription env keys to backend .env.example"
```

---

## 수동 E2E 검증 (토스 테스트 키)

구현 완료 후 로컬에서 (백엔드 :3010, 프론트 :3011):

1. 신규 계정/그룹으로 로그인 → 경기 10회 생성 → 11번째에서 `/subscription`으로 리다이렉트 + 토스트 확인.
2. `/subscription`에서 월 플랜 선택 → 구독하기 → 토스 테스트 카드 등록 → 복귀 시 "구독 중 · 다음 결제일" 표시.
3. 구독 상태에서 경기 무제한 생성 확인.
4. 결제 내역에 1건 표시 확인.
5. 구독 해지 → "해지 예약됨" → 해지 취소 → "구독 중" 복귀 확인.
6. `POST /subscription/billing-key`를 이미 구독 중인 상태에서 재호출 → 409 확인.

---

## Self-Review 결과

**스펙 커버리지:**
- 데이터 모델(Subscription/Payment/Group) → Task 1 ✓
- customerKey를 Group에 저장 → Task 1(엔티티) + Task 4(`ensureCustomerKey`) ✓
- 카드 등록/첫 결제/409/첫 결제 실패 시 빌링키 폐기 → Task 4 ✓
- 자동 갱신/유예/expired → Task 7 ✓
- 해지/재활성화 → Task 5 ✓
- 결제 내역 → Task 5 ✓
- 5개 API 엔드포인트 → Task 6 ✓
- 게이팅(신규 생성만·원자적·402) → Task 8 ✓
- 그룹 삭제 시 구독 해지 + DELETE 소유권 수정 → Task 9 ✓
- 402 인터셉터 → Task 10 ✓
- 구독 페이지 + 토스 SDK → Task 11 ✓
- 잔여 횟수 배지 → Task 12 ✓
- 설정값/env → Task 2/13 ✓
- 테스트(게이팅/상태전이/크론 mock/409/첫결제실패/그룹삭제) → Task 4/5/7/8/9 ✓

**타입 일관성:** `BillingCycle`/`SubscriptionStatus`/`ACTIVE_STATUSES`/`SUBSCRIPTION_REQUIRED_CODE`는 Task 1의 `subscription.constants.ts`에서 정의되고 이후 모든 태스크가 동일 이름으로 참조. `SubscriptionService` 생성자 시그니처는 Task 4에서 확정되고 Task 5/7/9는 메서드 추가만 함(생성자 인자 순서 불변). 프론트 `StatusResponse`(Task 11)는 백엔드 `SubscriptionStatusResponse`(Task 4)와 필드가 일치.

**실행 시 확인 필요(플래그):**
- 토스 `@tosspayments/tosspayments-sdk`의 `payment.requestBillingAuth` 시그니처와 successUrl에 붙는 쿼리(`customerKey`/`authKey`)는 설치된 SDK 버전 문서로 재확인할 것 (Task 11 Step 3).
- `useSearchParams`는 Next.js 14에서 정적 렌더 경고가 있어 필요 시 `<Suspense>` 래핑 (Task 11 Step 6).
- 스코프 제외(웹훅/환불/업다운그레이드/관리자 화면)는 계획에 태스크 없음 — 의도된 제외.
- **부분 유니크 인덱스는 `synchronize: true`가 생성**하지만, 운영 DB `subscription` 테이블에 이미 유효 구독이 중복된 행이 있으면 인덱스 생성이 실패한다. 배포 전 테이블이 비어 있는지 확인(위 Global Constraints)하면 무해.

**코드 리뷰 반영(2026-07-14):**
- **[HIGH] 그룹 삭제 시 해지**: `cancelForGroup`을 `repository.update()` 중첩 relation where에서 QueryBuilder FK 조건으로 교체(조용한 no-op → 삭제 그룹 계속 청구 방지) + 자체 테스트 추가 (Task 9 Step 1/1b).
- **[HIGH] 이중 결제**: `Subscription` 부분 유니크 인덱스 백스톱 + `subscribe`의 유니크 위반 → 409 변환 + 레이스 테스트 (Task 1/4).
- **[MED] 크론 갱신 원자성**: 성공 경로 기간 연장 + 결제 기록을 트랜잭션으로 묶음 (Task 7).
- **[MED] 게임 groupId 일관성**: 신규 생성 시 `assertSameGroup(userGroupId, dto.groupId)` 강제 + 403 테스트 (Task 8).
- **[MED] write-on-GET**: `getStatus`의 `customerKey` 생성은 의도된 동작으로 명시 (Global Constraints).

**남은 LOW(수용/인지):**
- `past_due` → 갱신 성공 시 새 주기를 옛 `currentPeriodEnd` 기준으로 소급 계산 → 유예일만큼 사용자 손해. 드리프트 방지 의도로 수용.
- Task 11 `useEffect([searchParams])` 이중 발화 가능하나 토스 `authKey`가 1회용이라 2번째 `issueBillingKey`가 실패 → 이중 결제로 이어지지 않음. 무해.
- Task 11 결제 내역 쿼리 `enabled: !!subscribed` — `canceled`/`expired` 사용자는 과거 내역 미표시. 의도된 단순화.
