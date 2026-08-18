import { GameRepository } from './game.repository';

// 실제 DB 없이 쿼리 빌더 호출만 검증한다 (rankings.repository.spec.ts 패턴).
const createRepository = () => {
  const qb: any = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getMany: jest.fn().mockResolvedValue([]),
  };
  const inner = {
    target: {},
    manager: {},
    queryRunner: undefined,
    createQueryBuilder: jest.fn(() => qb),
  };
  const repository = new GameRepository(inner as any);
  return { repository, qb };
};

const rangeCalls = (qb: any) =>
  qb.andWhere.mock.calls.filter(
    (c: any[]) => typeof c[0] === 'string' && /game\."date"/.test(c[0]),
  );

describe('GameRepository.findByGroupId 날짜 범위', () => {
  test('from을 주면 시작 조건이 붙는다', async () => {
    const { repository, qb } = createRepository();

    await repository.findByGroupId(1, { from: '2026-01-01' });

    expect(qb.andWhere).toHaveBeenCalledWith('game."date" >= :from', {
      from: '2026-01-01',
    });
  });

  test('to를 주면 종료 조건이 붙는다', async () => {
    const { repository, qb } = createRepository();

    await repository.findByGroupId(1, { to: '2026-12-31' });

    expect(qb.andWhere).toHaveBeenCalledWith('game."date" <= :to', {
      to: '2026-12-31',
    });
  });

  test('범위를 안 주면 날짜 조건이 붙지 않는다', async () => {
    const { repository, qb } = createRepository();

    await repository.findByGroupId(1, { status: 'FINISHED' });

    expect(rangeCalls(qb)).toHaveLength(0);
  });

  test('page/limit이 없으면 페이징하지 않는다', async () => {
    const { repository, qb } = createRepository();

    await repository.findByGroupId(1, { from: '2026-01-01', to: '2026-12-31' });

    expect(qb.skip).not.toHaveBeenCalled();
    expect(qb.take).not.toHaveBeenCalled();
  });
});
