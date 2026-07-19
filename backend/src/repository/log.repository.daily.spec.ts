import { LogRepository } from 'src/repository/log.repository';
import { Not } from 'typeorm';

// 실제 DB 없이 find 호출 옵션(where 절 구성)만 검증한다. (logitem.repository.spec.ts 패턴)
const createRepository = () => {
  const inner = {
    target: {},
    manager: {},
    queryRunner: undefined,
    find: jest.fn().mockResolvedValue([]),
  };
  const repository = new LogRepository(inner as any);
  return { repository, inner };
};

describe('LogRepository.findByDaily', () => {
  test('groupId 필터와 relations를 포함해 조회한다', async () => {
    const { repository, inner } = createRepository();

    await repository.findByDaily('2026-07-18', 5);

    expect(inner.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          groupId: 5,
          game: { status: Not('DELETED') },
        }),
        relations: ['logitem', 'player'],
      }),
    );
  });

  test('쿼리 문자열로 들어온 groupId도 숫자로 변환해 필터한다', async () => {
    const { repository, inner } = createRepository();

    await repository.findByDaily('2026-07-18', '5' as unknown as number);

    expect(inner.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ groupId: 5 }),
      }),
    );
  });
});

describe('LogRepository.findDailyLogsWithGame', () => {
  test('groupId 필터와 player 포함 relations로 조회한다', async () => {
    const { repository, inner } = createRepository();

    await repository.findDailyLogsWithGame('2026-07-18', 5);

    expect(inner.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ groupId: 5 }),
        relations: ['logitem', 'game', 'player'],
      }),
    );
  });
});

describe('LogRepository.findDailyDates', () => {
  const createQueryBuilderStub = (rows: { date: string }[]) => {
    const qb = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    };
    return qb;
  };

  test('groupId 필터·CAST 캐스팅·DELETED 게임 제외·최신순 정렬로 날짜 목록을 조회한다', async () => {
    const { repository, inner } = createRepository();
    const qb = createQueryBuilderStub([
      { date: '2026-07-18' },
      { date: '2026-07-15' },
    ]);
    (inner as any).createQueryBuilder = jest.fn().mockReturnValue(qb);

    const result = await repository.findDailyDates(5);

    expect(qb.innerJoin).toHaveBeenCalledWith('log.game', 'game');
    expect(qb.select).toHaveBeenCalledWith(
      expect.stringContaining('CAST(log."createdAt" AS DATE)'),
      'date',
    );
    expect(qb.where).toHaveBeenCalledWith('log.groupId = :groupId', {
      groupId: 5,
    });
    expect(qb.andWhere).toHaveBeenCalledWith(`game.status != 'DELETED'`);
    expect(qb.orderBy).toHaveBeenCalledWith('date', 'DESC');
    expect(result).toEqual(['2026-07-18', '2026-07-15']);
  });

  test('쿼리 문자열로 들어온 groupId도 숫자로 변환해 필터한다', async () => {
    const { repository, inner } = createRepository();
    const qb = createQueryBuilderStub([]);
    (inner as any).createQueryBuilder = jest.fn().mockReturnValue(qb);

    await repository.findDailyDates('5' as unknown as number);

    expect(qb.where).toHaveBeenCalledWith('log.groupId = :groupId', {
      groupId: 5,
    });
  });
});
