import { ConflictException, HttpException, HttpStatus } from '@nestjs/common';
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
    findOne: jest
      .fn()
      .mockResolvedValue(
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
      requestBillingPayment: jest
        .fn()
        .mockRejectedValue(new Error('카드 거절')),
    };
    const dataSource = makeDataSource();
    const { service, payRepo } = makeService({ toss, dataSource });

    try {
      await service.subscribe(GROUP_ID, USER_ID, {
        authKey: 'a',
        billingCycle: 'monthly',
      });
      fail('Should have thrown HttpException');
    } catch (e) {
      // Assert: 402 PAYMENT_REQUIRED
      expect(e).toBeInstanceOf(HttpException);
      expect((e as HttpException).getStatus()).toBe(
        HttpStatus.PAYMENT_REQUIRED,
      );

      // Assert: Payment recorded with status='failed'
      expect(payRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );

      // Assert: transaction was NOT entered
      expect(dataSource.transaction).not.toHaveBeenCalled();
    }
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
      expect.objectContaining({
        status: 'success',
        failReason: expect.any(String),
      }),
    );
  });

  test('유니크 위반이 아닌 persist 오류는 성공 Payment를 보정 기록하고 원본 오류를 그대로 던진다', async () => {
    const dbError = new Error('connection terminated unexpectedly');
    const dataSource = {
      transaction: jest.fn().mockRejectedValue(dbError),
    } as any;
    const { service, payRepo } = makeService({ dataSource });

    await expect(
      service.subscribe(GROUP_ID, USER_ID, {
        authKey: 'a',
        billingCycle: 'monthly',
      }),
    ).rejects.toBe(dbError);

    // 결제는 이미 성공했으므로 반영 실패로 유실되지 않도록 성공 Payment가
    // 보정 기록되어야 한다(확인 필요 메모 포함).
    expect(payRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        failReason: expect.stringContaining('확인 필요'),
      }),
    );
  });
});

describe('SubscriptionService.cancel/resume', () => {
  const { NotFoundException } = require('@nestjs/common');

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

describe('SubscriptionService.getStatus', () => {
  test('getStatus는 유료화 시작 여부를 포함한다', async () => {
    const dataSource = makeDataSource();
    const settingRepoMock = { findOne: jest.fn().mockResolvedValue(null) };
    dataSource.getRepository = jest.fn().mockReturnValue(settingRepoMock);
    const { service } = makeService({ dataSource });

    const status = await service.getStatus(GROUP_ID);

    expect(status.monetizationStarted).toBe(false);
  });
});

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
