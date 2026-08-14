import { LogService } from './log.service';

// daily 조회 로직 검증용 최소 스텁 (log.service.quarter.spec.ts 패턴)
const GOAL = { id: 200, name: '골', value: 2 };
const ASSIST = { id: 201, name: '어시스트', value: 1 };

const makeLog = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  groupId: 1,
  gameId: 10,
  playerId: 100,
  logitemId: GOAL.id,
  logitem: GOAL,
  player: { id: 100, name: '홍길동', backnumber: '7' },
  ...overrides,
});

const createService = ({
  dailyLogs = [] as any[],
  gameLogs = [] as any[],
  dates = [] as string[],
  inGamePlayers = [] as any[],
} = {}) => {
  const logRepository = {
    findByDaily: jest.fn().mockResolvedValue(dailyLogs),
    findDailyLogsWithGame: jest.fn().mockResolvedValue(gameLogs),
    findDailyDates: jest.fn().mockResolvedValue(dates),
  };
  const inGamePlayerRepository = {
    find: jest.fn().mockResolvedValue(inGamePlayers),
  };
  const dataSource = {
    getRepository: jest.fn().mockReturnValue(inGamePlayerRepository),
  };
  const service = new LogService(
    logRepository as any,
    {} as any,
    dataSource as any,
    {} as any,
    {} as any,
  );
  return { service, logRepository, inGamePlayerRepository };
};

describe('LogService.getLogByDaily', () => {
  test('date와 groupId를 리포지토리에 그대로 전달한다', async () => {
    const { service, logRepository } = createService();

    await service.getLogByDaily('2026-07-18', 5);

    expect(logRepository.findByDaily).toHaveBeenCalledWith('2026-07-18', 5);
  });

  test('선수별 totalScore와 항목별 count를 집계한다', async () => {
    const { service } = createService({
      dailyLogs: [
        makeLog({ id: 1 }),
        makeLog({ id: 2 }),
        makeLog({ id: 3, logitemId: ASSIST.id, logitem: ASSIST }),
      ],
    });

    const result = await service.getLogByDaily('2026-07-18', 1);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 100,
      name: '홍길동',
      totalScore: 5, // 골 2 + 골 2 + 어시스트 1
    });
    expect(result[0].logItem[GOAL.id].count).toBe(2);
    expect(result[0].logItem[ASSIST.id].count).toBe(1);
  });

  test('player가 null인 로그는 스킵한다 (FK 제거 정책)', async () => {
    const { service } = createService({
      dailyLogs: [makeLog(), makeLog({ id: 2, playerId: 999, player: null })],
    });

    const result = await service.getLogByDaily('2026-07-18', 1);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(100);
  });
});

describe('LogService.getDailyDates', () => {
  test('그룹의 로그 날짜 목록을 리포지토리에서 그대로 반환한다', async () => {
    const { service, logRepository } = createService({
      dates: ['2026-07-18', '2026-07-15'],
    });

    const result = await service.getDailyDates(5);

    expect(logRepository.findDailyDates).toHaveBeenCalledWith(5);
    expect(result).toEqual(['2026-07-18', '2026-07-15']);
  });
});

const FINISHED_GAME = {
  id: 10,
  homeTeamName: '홈팀',
  awayTeamName: '어웨이팀',
  status: 'FINISHED',
};

const makeGameLog = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  groupId: 1,
  gameId: 10,
  playerId: 100,
  logitemId: GOAL.id,
  logitem: GOAL,
  player: { id: 100, name: '홍길동' },
  game: FINISHED_GAME,
  ...overrides,
});

describe('LogService.getDailyGames', () => {
  test('InGamePlayer team 기준으로 홈/어웨이 스코어를 합산한다', async () => {
    const { service } = createService({
      gameLogs: [
        makeGameLog({ id: 1, playerId: 100 }), // home, 골 +2
        makeGameLog({ id: 2, playerId: 100, logitemId: ASSIST.id, logitem: ASSIST }), // home, +1
        makeGameLog({ id: 3, playerId: 101, player: { id: 101, name: '김철수' } }), // away, +2
      ],
      inGamePlayers: [
        { gameId: 10, playerId: 100, team: 'home' },
        { gameId: 10, playerId: 101, team: 'away' },
      ],
    });

    const result = await service.getDailyGames('2026-07-18', 1);

    expect(result).toEqual([
      {
        id: 10,
        homeTeamName: '홈팀',
        awayTeamName: '어웨이팀',
        homeScore: 3,
        awayScore: 2,
        status: 'FINISHED',
      },
    ]);
  });

  test('player가 null이거나 팀 매칭이 없는 로그는 스코어에서 제외하되 게임은 포함한다', async () => {
    const { service } = createService({
      gameLogs: [
        makeGameLog({ id: 1, playerId: 999, player: null }), // 삭제된 선수
        makeGameLog({ id: 2, playerId: 102, player: { id: 102, name: '박영수' } }), // InGamePlayer 매칭 없음
      ],
      inGamePlayers: [],
    });

    const result = await service.getDailyGames('2026-07-18', 1);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 10, homeScore: 0, awayScore: 0 });
  });

  test('로그가 없으면 InGamePlayer를 조회하지 않고 빈 배열을 반환한다', async () => {
    const { service, inGamePlayerRepository } = createService({ gameLogs: [] });

    const result = await service.getDailyGames('2026-07-18', 1);

    expect(result).toEqual([]);
    expect(inGamePlayerRepository.find).not.toHaveBeenCalled();
  });
});
