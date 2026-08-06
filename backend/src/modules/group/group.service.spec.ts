import { ForbiddenException } from '@nestjs/common';
import { GroupService } from './group.service';
import { Logitem } from '../../entities/Logitem.entity';

const OWN_GROUP = 1;
const OTHER_GROUP = 2;

const makeService = () => {
  const groupRepository = {
    createGroup: jest.fn(),
    softDeleteById: jest.fn().mockResolvedValue(undefined),
  };
  const subscriptionService = {
    cancelForGroup: jest.fn().mockResolvedValue(undefined),
  };
  // onModuleInit 시드가 사용하는 트랜잭션 EntityManager 목
  const txManager = {
    query: jest.fn().mockResolvedValue(undefined),
    count: jest.fn().mockResolvedValue(0),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const logitemRepository = {
    manager: {
      transaction: jest.fn(async (fn: any) => fn(txManager)),
      // createGroup의 로그 항목 시드가 쓰는 경로
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue(undefined),
    },
  };
  const service = new GroupService(
    groupRepository as any,
    subscriptionService as any,
    logitemRepository as any,
  );
  return {
    service,
    groupRepository,
    subscriptionService,
    logitemRepository,
    txManager,
  };
};

describe('GroupService.onModuleInit', () => {
  test('템플릿 그룹(0)이 비어 있으면 advisory lock 후 기본 로그 항목 10개를 시드한다', async () => {
    const { service, txManager } = makeService();
    txManager.count.mockResolvedValue(0);

    await service.onModuleInit();

    // 중복 시드 방지 락을 먼저 잡아야 한다
    expect(txManager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock($1)',
      [expect.any(Number)],
    );
    expect(txManager.query.mock.invocationCallOrder[0]).toBeLessThan(
      txManager.count.mock.invocationCallOrder[0],
    );
    const saved = txManager.save.mock.calls[0][0];
    expect(saved).toHaveLength(10);
    saved.forEach((item) => expect(item.groupId).toBe(0));
    expect(saved.map((i) => i.name)).toEqual([
      '어시',
      '리바',
      '스틸',
      '블록',
      '턴오버',
      '파울',
      '3점',
      '2점',
      '자유투1점',
      '자유투2점',
    ]);
  });

  test('템플릿 그룹(0)에 항목이 이미 있으면 시드하지 않는다 (멱등)', async () => {
    const { service, txManager } = makeService();
    txManager.count.mockResolvedValue(10);

    await service.onModuleInit();

    expect(txManager.save).not.toHaveBeenCalled();
  });

  test('시드 트랜잭션이 실패해도 예외를 던지지 않는다 (부팅 차단 방지)', async () => {
    const { service, logitemRepository } = makeService();
    logitemRepository.manager.transaction.mockRejectedValue(
      new Error('db down'),
    );

    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});

// 복제 규칙 자체(id 미복사·기본 항목 폴백)는 logitem-seed.spec.ts가 검증한다.
// 여기서는 createGroup이 새 그룹 id로 시드를 부르는지만 본다.
describe('GroupService.createGroup', () => {
  test('그룹 생성 시 템플릿 그룹(0)의 로그 항목을 새 그룹으로 복제한다', async () => {
    const { service, groupRepository, logitemRepository } = makeService();
    const NEW_GROUP_ID = 7;
    groupRepository.createGroup.mockResolvedValue({
      id: NEW_GROUP_ID,
      name: '새그룹',
    });
    const templates = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      groupId: 0,
      name: `항목${i + 1}`,
      value: i,
    }));
    logitemRepository.manager.find.mockResolvedValue(templates);

    const created = await service.createGroup({ name: '새그룹' } as any);

    expect(created.id).toBe(NEW_GROUP_ID);
    const saved = logitemRepository.manager.save.mock.calls[0][1] as Logitem[];
    expect(saved).toHaveLength(10);
    saved.forEach((item, i) => {
      expect(item.groupId).toBe(NEW_GROUP_ID);
      expect(item.name).toBe(templates[i].name);
      expect(item.value).toBe(templates[i].value);
      // 템플릿 행의 id가 복사되면 원본을 덮어쓰므로 id는 없어야 한다
      expect(item.id).toBeUndefined();
    });
  });

  // 부팅 시드 실패로 템플릿이 비어 있어도 새 그룹이 빈 채로 남지 않아야 한다.
  test('템플릿 그룹이 비어 있으면 기본 항목으로 시드한다', async () => {
    const { service, groupRepository, logitemRepository } = makeService();
    groupRepository.createGroup.mockResolvedValue({ id: 8, name: '새그룹' });
    logitemRepository.manager.find.mockResolvedValue([]);

    await service.createGroup({ name: '새그룹' } as any);

    const saved = logitemRepository.manager.save.mock.calls[0][1] as Logitem[];
    expect(saved).toHaveLength(10);
    saved.forEach((item) => expect(item.groupId).toBe(8));
  });
});

describe('GroupService.deleteGroup', () => {
  test('다른 그룹을 삭제하려 하면 ForbiddenException', async () => {
    const { service, groupRepository } = makeService();
    await expect(service.deleteGroup(OTHER_GROUP, OWN_GROUP)).rejects.toThrow(
      ForbiddenException,
    );
    expect(groupRepository.softDeleteById).not.toHaveBeenCalled();
  });

  test('내 그룹 삭제 시 구독을 해지하고 soft delete 한다', async () => {
    const { service, groupRepository, subscriptionService } = makeService();
    await service.deleteGroup(OWN_GROUP, OWN_GROUP);
    expect(subscriptionService.cancelForGroup).toHaveBeenCalledWith(OWN_GROUP);
    expect(groupRepository.softDeleteById).toHaveBeenCalledWith(OWN_GROUP);
  });
});
