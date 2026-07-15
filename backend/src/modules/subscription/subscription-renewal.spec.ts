import { SubscriptionService } from './subscription.service';
import { addBillingPeriod } from './subscription.util';
import { Payment } from 'src/entities/Payment.entity';
import { Subscription } from 'src/entities/Subscription.entity';

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
  const payRepo = {
    save: jest.fn(async (o: any) => o),
    create: (o: any) => o,
    // 기본은 insert 경로(기존 행 없음) — 특정 테스트에서 override한다.
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn(async () => ({ affected: 1 })),
  };
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
    // 기본은 insert 경로(기존 행 없음) — 특정 테스트에서 override한다.
    findOne: jest.fn().mockResolvedValue(null),
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

  test('거절 후 재결제 성공 시 기존 실패 Payment 행을 success로 갱신한다 (충돌 없음)', async () => {
    // 이전 크론에서 같은 orderId로 실패 Payment 행(id=42)이 이미 존재하는 상황을
    // manager.findOne이 반환하도록 세팅 — success 경로가 insert가 아니라
    // update를 호출해야 orderId 유니크 제약과 충돌하지 않는다.
    const { service, manager } = makeService({ ...baseSub });
    manager.findOne.mockResolvedValue({ id: 42, status: 'failed' });

    await service.renewDueSubscriptions(NOW);

    expect(manager.update).toHaveBeenCalledWith(
      Payment,
      42,
      expect.objectContaining({ status: 'success' }),
    );
    expect(manager.save).not.toHaveBeenCalled();
    expect(manager.update).toHaveBeenCalledWith(
      Subscription,
      1,
      expect.objectContaining({ status: 'active' }),
    );
  });

  test('이전 실패(failed) Payment 행이 있으면 재시도 시 신선한 일자별 idempotencyKey를 사용한다', async () => {
    const { service, payRepo, toss } = makeService({ ...baseSub });
    payRepo.findOne.mockResolvedValue({
      id: 99,
      orderId: 'renew_1_2026-07-13T00:00:00.000Z',
      status: 'failed',
    });

    await service.renewDueSubscriptions(NOW);

    expect(payRepo.findOne).toHaveBeenCalledWith({
      where: { orderId: 'renew_1_2026-07-13T00:00:00.000Z', status: 'failed' },
    });
    expect(toss.requestBillingPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'renew_1_2026-07-13T00:00:00.000Z_retry_2026-07-14',
      }),
    );
  });

  test('이전 실패(failed) Payment 행이 없으면 idempotencyKey를 전달하지 않는다(기본 orderId 유지)', async () => {
    const { service, toss } = makeService({ ...baseSub });

    await service.renewDueSubscriptions(NOW);

    expect(
      toss.requestBillingPayment.mock.calls[0][0].idempotencyKey,
    ).toBeUndefined();
  });

  test('여러 구독 처리 중 하나가 실패해도 나머지 구독은 격리되어 계속 처리된다', async () => {
    // sub1은 해지 예약 상태 — canceled 전환 update가 예상치 못하게 실패한다
    // (예: DB 순간 장애). per-sub try/catch로 격리되어 sub2는 정상 처리되어야 한다.
    const sub1 = {
      ...baseSub,
      id: 1,
      group: { id: 1, customerKey: 'cust_1' },
      cancelAtPeriodEnd: true,
    };
    const sub2 = {
      ...baseSub,
      id: 2,
      group: { id: 2, customerKey: 'cust_2' },
      cancelAtPeriodEnd: false,
    };
    const subRepo = {
      find: jest.fn().mockResolvedValue([sub1, sub2]),
      // sub1의 canceled 상태 업데이트에서 예상치 못한 오류 발생 — 예: DB 순간 장애
      update: jest
        .fn()
        .mockRejectedValueOnce(new Error('unexpected db error for sub1'))
        .mockResolvedValue({ affected: 1 }),
    };
    const payRepo = {
      save: jest.fn(async (o: any) => o),
      create: (o: any) => o,
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn(async () => ({ affected: 1 })),
    };
    const groupRepo = {};
    const toss = {
      requestBillingPayment: jest.fn().mockResolvedValue({
        paymentKey: 'pk',
        orderId: 'ord',
        approvedAt: NOW.toISOString(),
      }),
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn(async () => ({ affected: 1 })),
      save: jest.fn(async (_e: any, o: any) => o),
    };
    const dataSource = {
      transaction: jest.fn(async (cb: any) => cb(manager)),
    };
    const service = new SubscriptionService(
      subRepo as any,
      payRepo as any,
      groupRepo as any,
      toss as any,
      dataSource as any,
    );

    await service.renewDueSubscriptions(NOW);

    // sub1은 canceled 전환 subRepo.update 호출에서 예외가 나지만(toss 호출 전 단계),
    // per-sub try/catch로 격리되어 sub2는 정상적으로 계속 처리되어야 한다.
    expect(toss.requestBillingPayment).toHaveBeenCalledTimes(1);
    expect(toss.requestBillingPayment).toHaveBeenCalledWith(
      expect.objectContaining({ customerKey: 'cust_2' }),
    );
    expect(manager.update).toHaveBeenCalledWith(
      Subscription,
      2,
      expect.objectContaining({ status: 'active' }),
    );
  });
});
