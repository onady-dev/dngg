import { ConflictException, NotFoundException } from '@nestjs/common';
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
    // 삭제된(soft-delete) 게임은 backfill 카운트에서 제외되어야 한다
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining(`"game"."status" != 'DELETED'`),
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

    // 삭제된(soft-delete) 게임은 그룹별 게임 수 집계에서 제외되어야 한다
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining(`"status" != 'DELETED'`),
    );

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
