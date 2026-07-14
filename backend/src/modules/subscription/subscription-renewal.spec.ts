import { SubscriptionService } from './subscription.service';
import { addBillingPeriod } from './subscription.util';

const NOW = new Date('2026-07-14T00:00:00Z');

const makeService = (
  sub: any,
  tossOverrides: any = {},
  dataSourceOverrides: any = {},
) => {
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
  const dataSource = {
    transaction: jest.fn(async (cb: any) => cb(manager)),
    ...dataSourceOverrides,
  };
  const service = new SubscriptionService(
    subRepo as any,
    payRepo as any,
    groupRepo as any,
    toss as any,
    dataSource as any,
  );
  return { service, subRepo, payRepo, toss, manager, dataSource };
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
      expect.objectContaining({
        status: 'active',
        // 드리프트 방지: 이전 종료일(2026-07-13) 기준으로 계산되어야 한다.
        currentPeriodStart: baseSub.currentPeriodEnd,
        currentPeriodEnd: addBillingPeriod(baseSub.currentPeriodEnd, 'monthly'),
      }),
    );
  });

  test('결제 요청 시 결정적인 orderId(renew_{id}_{periodEnd})를 사용한다', async () => {
    const { service, toss } = makeService({ ...baseSub });
    await service.renewDueSubscriptions(NOW);
    expect(toss.requestBillingPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'renew_1_2026-07-13T00:00:00.000Z',
      }),
    );
  });

  test('결제는 성공했지만 DB persist가 실패하면 실패로 오분류하지 않는다', async () => {
    const { service, toss, subRepo, payRepo, dataSource } = makeService(
      { ...baseSub },
      undefined,
      { transaction: jest.fn().mockRejectedValue(new Error('db down')) },
    );
    await service.renewDueSubscriptions(NOW);

    expect(toss.requestBillingPayment).toHaveBeenCalled();
    expect(dataSource.transaction).toHaveBeenCalled();
    expect(subRepo.update).not.toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'past_due' }),
    );
    expect(subRepo.update).not.toHaveBeenCalledWith(
      1,
      expect.objectContaining({ status: 'expired' }),
    );
    expect(payRepo.save).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
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
