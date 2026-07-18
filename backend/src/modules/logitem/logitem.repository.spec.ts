import { LogitemRepository } from 'src/repository/config.repository';

// 실제 DB 없이 find 호출 옵션(where 절 구성)만 검증한다.
const createRepository = () => {
  const inner = {
    target: {},
    manager: {},
    queryRunner: undefined,
    find: jest.fn().mockResolvedValue([]),
  };
  const repository = new LogitemRepository(inner as any);
  return { repository, inner };
};

describe('LogitemRepository.findByGroupId', () => {
  test('groupId로 필터해 조회한다', async () => {
    const { repository, inner } = createRepository();

    await repository.findByGroupId(15);

    expect(inner.find).toHaveBeenCalledWith({ where: { groupId: 15 } });
  });

  test('쿼리 문자열로 들어온 groupId도 숫자로 변환해 필터한다', async () => {
    const { repository, inner } = createRepository();

    await repository.findByGroupId('15' as unknown as number);

    expect(inner.find).toHaveBeenCalledWith({ where: { groupId: 15 } });
  });
});
