import { LogService } from './log.service';

// 쿼터 스탬프 검증에 필요한 최소 스텁만 구성한다.
const createService = (game: {
  id: number;
  groupId: number;
  currentQuarter?: number;
}) => {
  const logRepository = {
    findLastLogByGameId: jest.fn().mockResolvedValue({ id: 5, sequence: 3 }),
    createLog: jest.fn().mockResolvedValue({ id: 6 }),
    findLogByGameIdAndSequence: jest
      .fn()
      .mockResolvedValue({ id: 4, sequence: 2, quarter: 2 }),
  };
  const gameRepository = {
    findOne: jest.fn().mockResolvedValue(game),
  };
  const dataSource = {
    getRepository: jest.fn().mockReturnValue({
      count: jest.fn().mockResolvedValue(1),
    }),
  };
  const service = new LogService(
    logRepository as any,
    gameRepository as any,
    dataSource as any,
  );
  return { service, logRepository };
};

describe('LogService 쿼터 스탬프', () => {
  const GROUP = 1;
  const GAME_ID = 10;
  const dto = {
    groupId: GROUP,
    gameId: GAME_ID,
    playerId: 100,
    logitemId: 200,
  };

  test('createLog는 게임의 currentQuarter를 로그에 찍는다', async () => {
    const { service, logRepository } = createService({
      id: GAME_ID,
      groupId: GROUP,
      currentQuarter: 3,
    });

    await service.createLog(dto as any, GROUP);

    expect(logRepository.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ quarter: 3 }),
    );
  });

  test('currentQuarter가 없는 게임(레거시)은 1쿼터로 찍는다', async () => {
    const { service, logRepository } = createService({
      id: GAME_ID,
      groupId: GROUP,
    });

    await service.createLog(dto as any, GROUP);

    expect(logRepository.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ quarter: 1 }),
    );
  });

  test('redoLog는 원본 로그의 quarter를 유지한다', async () => {
    const { service, logRepository } = createService({
      id: GAME_ID,
      groupId: GROUP,
      currentQuarter: 4,
    });

    await service.redoLog(GAME_ID, 2, GROUP);

    expect(logRepository.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ quarter: 2 }),
    );
  });
});
