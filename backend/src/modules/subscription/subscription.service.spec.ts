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
      expect((e as HttpException).getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);

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
      expect.objectContaining({ status: 'success', failReason: expect.any(String) }),
    );
  });
});
