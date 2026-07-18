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
  dates = [] as string[],
} = {}) => {
  const logRepository = {
    findByDaily: jest.fn().mockResolvedValue(dailyLogs),
    findDailyDates: jest.fn().mockResolvedValue(dates),
  };
  const service = new LogService(
    logRepository as any,
    {} as any,
    {} as any,
  );
  return { service, logRepository };
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
