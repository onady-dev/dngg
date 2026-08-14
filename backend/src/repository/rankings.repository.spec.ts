import { RankingsRepository } from './rankings.repository';

// 실제 DB 없이 쿼리 빌더 호출만 검증한다 (log.repository.daily.spec.ts 패턴).
const createRepository = () => {
  const qb: any = {
    innerJoin: jest.fn(() => qb),
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    groupBy: jest.fn(() => qb),
    addGroupBy: jest.fn(() => qb),
    getRawMany: jest.fn().mockResolvedValue([]),
  };
  const inner = { createQueryBuilder: jest.fn(() => qb) };
  const repository = new RankingsRepository(inner as any);
  return { repository, qb };
};

describe('RankingsRepository.aggregateRankings', () => {
  test('삭제된 게임을 제외한다', async () => {
    const { repository, qb } = createRepository();

    await repository.aggregateRankings(1);

    expect(qb.andWhere).toHaveBeenCalledWith("game.status != 'DELETED'");
  });

  test('seasonId를 주면 시즌 조건을 추가한다', async () => {
    const { repository, qb } = createRepository();

    await repository.aggregateRankings(1, 42);

    expect(qb.andWhere).toHaveBeenCalledWith('game.seasonId = :seasonId', {
      seasonId: 42,
    });
  });

  test('seasonId가 없으면 시즌 조건을 넣지 않는다 (전체 조회)', async () => {
    const { repository, qb } = createRepository();

    await repository.aggregateRankings(1);

    const seasonCalls = qb.andWhere.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('seasonId'),
    );
    expect(seasonCalls).toHaveLength(0);
  });

  test('삭제된 선수를 제외하기 위해 player를 inner join한다', async () => {
    const { repository, qb } = createRepository();

    await repository.aggregateRankings(1);

    expect(qb.innerJoin).toHaveBeenCalledWith('log.player', 'player');
  });

  test('raw 결과를 숫자 타입으로 변환해 반환한다', async () => {
    const { repository, qb } = createRepository();
    qb.getRawMany.mockResolvedValue([
      {
        playerId: '3',
        playerName: '선수',
        backnumber: '7',
        logitemId: '1',
        logitemName: '3점',
        logitemValue: '3',
        count: '2',
        valueSum: '6',
      },
    ]);

    const rows = await repository.aggregateRankings(1);

    expect(rows[0]).toEqual({
      playerId: 3,
      playerName: '선수',
      backnumber: '7',
      logitemId: 1,
      logitemName: '3점',
      logitemValue: 3,
      count: 2,
      valueSum: 6,
    });
  });
});
