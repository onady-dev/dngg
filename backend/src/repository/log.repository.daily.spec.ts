import { LogRepository } from 'src/repository/log.repository';

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
        where: expect.objectContaining({ groupId: 5 }),
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
