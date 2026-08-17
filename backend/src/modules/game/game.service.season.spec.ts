import { GameService } from './game.service';
import { Game } from 'src/entities/Game.entity';
import { AppSetting } from 'src/entities/AppSetting.entity';

const GROUP_ID = 1;
const CURRENT_SEASON_ID = 42;

// saveGameAndLogs의 seasonId 결정 로직만 확인하기 위한 최소 스텁.
const createService = (options: {
  currentSeasonId: number | null;
  existingGame?: { id: number; groupId: number; seasonId: number | null };
}) => {
  const saveGame = jest.fn().mockResolvedValue({ id: 500 });
  const gameRepository = {
    saveGame,
    findOne: jest.fn().mockResolvedValue(options.existingGame ?? null),
  };
  const inGamePlayersRepository = {
    emptyInGamePlayers: jest.fn().mockResolvedValue(undefined),
    saveInGamePlayers: jest.fn().mockResolvedValue(undefined),
  };
  const logRepository = {
    emptyLog: jest.fn().mockResolvedValue(undefined),
    saveLog: jest.fn().mockResolvedValue(undefined),
  };
  const manager = {
    findOne: jest.fn().mockImplementation((entity: any) => {
      if (entity === Game) {
        return Promise.resolve({ id: 500 });
      }
      // Group 조회
      return Promise.resolve({
        id: GROUP_ID,
        currentSeasonId: options.currentSeasonId,
      });
    }),
    count: jest.fn().mockResolvedValue(1),
    getRepository: jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue({ id: 500 }),
    }),
    save: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
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
    getRepository: jest.fn().mockReturnValue({ count: jest.fn().mockResolvedValue(0) }),
  };
  const service = new GameService(
    gameRepository as any,
    inGamePlayersRepository as any,
    logRepository as any,
    dataSource as any,
  );
  return { service, saveGame, gameRepository };
};

describe('GameService seasonId 스냅샷', () => {
  test('resolveSeasonId는 그룹의 현재 시즌을 반환한다', async () => {
    const { service } = createService({ currentSeasonId: CURRENT_SEASON_ID });

    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: GROUP_ID,
        currentSeasonId: CURRENT_SEASON_ID,
      }),
    };

    const result = await (service as any).resolveSeasonId(manager, GROUP_ID, undefined);

    expect(result).toBe(CURRENT_SEASON_ID);
  });

  test('현재 시즌이 없으면 null이다', async () => {
    const { service } = createService({ currentSeasonId: null });

    const manager = {
      findOne: jest.fn().mockResolvedValue({ id: GROUP_ID, currentSeasonId: null }),
    };

    const result = await (service as any).resolveSeasonId(manager, GROUP_ID, undefined);

    expect(result).toBeNull();
  });

  test('그룹을 찾지 못하면 null이다', async () => {
    const { service } = createService({ currentSeasonId: null });

    const manager = { findOne: jest.fn().mockResolvedValue(null) };

    const result = await (service as any).resolveSeasonId(manager, GROUP_ID, undefined);

    expect(result).toBeNull();
  });

  test('기존 경기를 덮어쓸 때는 그 경기의 seasonId를 유지한다', async () => {
    const { service } = createService({ currentSeasonId: CURRENT_SEASON_ID });

    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: GROUP_ID,
        currentSeasonId: CURRENT_SEASON_ID,
      }),
    };

    // 기존 경기 id가 주어지면 현재 시즌을 조회하지 않고 원래 값을 쓴다
    const result = await (service as any).resolveSeasonId(manager, GROUP_ID, 7);

    expect(result).toBe(7);
    expect(manager.findOne).not.toHaveBeenCalled();
  });

  test('기존 경기의 seasonId가 null이면 null을 유지한다', async () => {
    const { service } = createService({ currentSeasonId: CURRENT_SEASON_ID });

    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: GROUP_ID,
        currentSeasonId: CURRENT_SEASON_ID,
      }),
    };

    const result = await (service as any).resolveSeasonId(manager, GROUP_ID, null);

    expect(result).toBeNull();
    expect(manager.findOne).not.toHaveBeenCalled();
  });
});

// ---- 통합 테스트: saveGameAndLogs가 resolveSeasonId를 실제로 배선하는지 검증 ----
// 위 5개 테스트는 (service as any).resolveSeasonId(...)를 직접 호출해 헬퍼
// 자체의 로직만 검증한다. saveGameAndLogs()는 한 번도 호출되지 않으므로,
// saveGameAndLogs가 헬퍼를 올바른 인자로 호출하는지, 계산된 seasonId가
// 실제로 gameRepository.saveGame에 전달되는 gameInstance에 반영되는지는
// 별도로 확인해야 한다. 아래 두 테스트는 saveGameAndLogs()를 실제로 호출한다.
const makeDto = (overrides: any = {}) => ({
  groupId: GROUP_ID,
  homeTeamName: 'home',
  awayTeamName: 'away',
  homePlayers: [],
  awayPlayers: [],
  logs: [],
  ...overrides,
});

const createIntegrationService = (opts: {
  existingGame?: { id: number; groupId: number; seasonId: number | null } | null;
  currentSeasonId: number | null;
}) => {
  const saveGame = jest.fn().mockResolvedValue({ id: 500 });
  const gameRepository = {
    saveGame,
    // dto.id가 있으면 assertGameInGroup(findOwnedGame)이 소유권 확인차 호출한다.
    findOne: jest.fn().mockResolvedValue(
      opts.existingGame ? { groupId: opts.existingGame.groupId } : null,
    ),
  };
  const inGamePlayersRepository = {
    emptyInGamePlayers: jest.fn().mockResolvedValue(undefined),
    saveInGamePlayers: jest.fn().mockResolvedValue(undefined),
  };
  const logRepository = {
    emptyLog: jest.fn().mockResolvedValue(undefined),
    saveLog: jest.fn().mockResolvedValue(undefined),
  };
  const manager = {
    // 엔티티별로 다른 값을 반환한다: AppSetting(게이팅 우회) / Game(기존 경기
    // 조회) / 그 외(Group 조회).
    findOne: jest.fn().mockImplementation((entity: any) => {
      if (entity === AppSetting) {
        // 유료화 시작 전 상태로 두어 게이팅 분기를 완전히 우회한다 —
        // 이 테스트의 관심사는 seasonId 배선이지 과금 게이팅이 아니다.
        return Promise.resolve(null);
      }
      if (entity === Game) {
        return Promise.resolve(opts.existingGame ?? null);
      }
      return Promise.resolve({
        id: GROUP_ID,
        currentSeasonId: opts.currentSeasonId,
      });
    }),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    }),
    getRepository: jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue({ id: 500 }),
    }),
    save: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
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
    getRepository: jest
      .fn()
      .mockReturnValue({ count: jest.fn().mockResolvedValue(0) }),
  };
  const service = new GameService(
    gameRepository as any,
    inGamePlayersRepository as any,
    logRepository as any,
    dataSource as any,
  );
  return { service, saveGame };
};

describe('GameService seasonId 스냅샷 - saveGameAndLogs 배선 통합 테스트', () => {
  test('신규 경기 생성 시 saveGame에 전달되는 gameInstance.seasonId가 그룹의 현재 시즌이다', async () => {
    const { service, saveGame } = createIntegrationService({
      existingGame: null,
      currentSeasonId: CURRENT_SEASON_ID,
    });

    await service.saveGameAndLogs(makeDto(), GROUP_ID);

    expect(saveGame).toHaveBeenCalledTimes(1);
    const [gameInstance] = saveGame.mock.calls[0];
    expect(gameInstance.seasonId).toBe(CURRENT_SEASON_ID);
  });

  test('기존 경기를 덮어쓸 때 saveGame에 전달되는 gameInstance.seasonId는 원래 값을 유지한다', async () => {
    const EXISTING_GAME_ID = 500;
    const ORIGINAL_SEASON_ID = 7;
    const { service, saveGame } = createIntegrationService({
      existingGame: {
        id: EXISTING_GAME_ID,
        groupId: GROUP_ID,
        seasonId: ORIGINAL_SEASON_ID,
      },
      // 현재 시즌은 원래 시즌과 다르지만, 덮어쓰기에서는 무시되어야 한다.
      currentSeasonId: CURRENT_SEASON_ID,
    });

    await service.saveGameAndLogs(
      makeDto({ id: EXISTING_GAME_ID }),
      GROUP_ID,
    );

    expect(saveGame).toHaveBeenCalledTimes(1);
    const [gameInstance] = saveGame.mock.calls[0];
    expect(gameInstance.seasonId).toBe(ORIGINAL_SEASON_ID);
  });
});
