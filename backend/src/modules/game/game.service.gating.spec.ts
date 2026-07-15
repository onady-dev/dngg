import { ForbiddenException, HttpException } from '@nestjs/common';
import { GameService } from './game.service';
import { AppSetting } from '../../entities/AppSetting.entity';

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
  // 카운터 원자적 증가 QB의 execute — 개별 참조로 노출해 호출 여부를 단언한다.
  const counterUpdateExecute = jest
    .fn()
    .mockResolvedValue({ affected: opts.incrementAffected });
  const manager = {
    // 유료화 시작 여부(AppSetting) 조회 — 기본은 "시작됨" 행을 반환해
    // 기존 게이팅 테스트들의 전제(유료화 시작 후)를 유지한다.
    findOne: jest.fn().mockImplementation((entity: any) =>
      entity === AppSetting
        ? Promise.resolve({
            key: 'monetizationStartedAt',
            value: '2026-07-15T00:00:00.000Z',
          })
        : Promise.resolve(null),
    ),
    // 구독 존재 여부 count
    count: jest.fn().mockResolvedValue(opts.activeSubCount),
    // 원자적 UPDATE ... WHERE freeGamesUsed < limit
    createQueryBuilder: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: counterUpdateExecute,
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
  return { service, queryRunner, manager, counterUpdateExecute };
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

  test('유료화 시작 전에는 구독 없이도 게이팅 없이 통과하고 카운터가 증가하지 않는다', async () => {
    const { service, manager, counterUpdateExecute } = makeService({
      activeSubCount: 0,
      incrementAffected: 0,
    });
    // AppSetting 조회가 null을 반환하도록 설정 (유료화 시작 전)
    manager.findOne = jest.fn().mockResolvedValue(null);

    await service.saveGameAndLogs(makeDto(), OWN_GROUP);

    // 구독 조회도, 원자적 증가도 호출되지 않는다
    expect(manager.count).not.toHaveBeenCalled();
    expect(counterUpdateExecute).not.toHaveBeenCalled();
  });

  test('관리자는 유료화 시작 후에도 게이팅 없이 통과하고 카운터가 증가하지 않는다', async () => {
    const { service, manager, counterUpdateExecute } = makeService({
      activeSubCount: 0,
      incrementAffected: 0,
    });
    // AppSetting은 시작됨 상태 유지 (makeService 기본 mock)

    await service.saveGameAndLogs(makeDto(), OWN_GROUP, 'admin');

    expect(manager.count).not.toHaveBeenCalled();
    expect(counterUpdateExecute).not.toHaveBeenCalled();
  });
});
