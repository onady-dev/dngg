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
