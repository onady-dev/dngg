import { GameService } from './game.service';
import { Game } from 'src/entities/Game.entity';

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
