import { EntityManager } from 'typeorm';
import { Logitem } from 'src/entities/Logitem.entity';
import {
  DEFAULT_LOGITEMS,
  TEMPLATE_GROUP_ID,
  seedLogitemsForGroup,
} from './logitem-seed';

const NEW_GROUP_ID = 42;

const makeManager = (templates: Partial<Logitem>[]) => {
  const manager = {
    find: jest.fn().mockResolvedValue(templates),
    save: jest.fn((_entity: unknown, v: unknown) => Promise.resolve(v)),
  };
  return manager as unknown as EntityManager & typeof manager;
};

describe('seedLogitemsForGroup', () => {
  test('템플릿 그룹(0)의 항목을 새 그룹 소속으로 복제한다', async () => {
    const templates = [
      { id: 1, groupId: TEMPLATE_GROUP_ID, name: '어시', value: 0 },
      { id: 2, groupId: TEMPLATE_GROUP_ID, name: '3점', value: 3 },
    ];
    const manager = makeManager(templates);

    await seedLogitemsForGroup(manager, NEW_GROUP_ID);

    expect(manager.find).toHaveBeenCalledWith(Logitem, {
      where: { groupId: TEMPLATE_GROUP_ID },
    });
    const saved = manager.save.mock.calls[0][1] as Logitem[];
    expect(saved).toHaveLength(2);
    expect(saved.map((i) => i.name)).toEqual(['어시', '3점']);
    expect(saved.map((i) => i.value)).toEqual([0, 3]);
    saved.forEach((item) => expect(item.groupId).toBe(NEW_GROUP_ID));
  });

  test('템플릿 행의 id는 복사하지 않는다 (복사하면 템플릿 원본을 덮어쓴다)', async () => {
    const manager = makeManager([
      { id: 1, groupId: TEMPLATE_GROUP_ID, name: '어시', value: 0 },
    ]);

    await seedLogitemsForGroup(manager, NEW_GROUP_ID);

    const saved = manager.save.mock.calls[0][1] as Logitem[];
    expect(saved[0].id).toBeUndefined();
  });

  // 부팅 시드(GroupService.onModuleInit)는 실패해도 부팅을 막지 않는다. 그 인스턴스에서
  // 가입이 일어나면 템플릿이 비어 있는데, 폴백이 없으면 새 그룹이 조용히 빈 채로 남는다.
  test('템플릿이 비어 있으면 기본 항목으로 폴백한다', async () => {
    const manager = makeManager([]);

    await seedLogitemsForGroup(manager, NEW_GROUP_ID);

    const saved = manager.save.mock.calls[0][1] as Logitem[];
    expect(saved).toHaveLength(DEFAULT_LOGITEMS.length);
    expect(saved.map((i) => i.name)).toEqual(
      DEFAULT_LOGITEMS.map((i) => i.name),
    );
    saved.forEach((item) => expect(item.groupId).toBe(NEW_GROUP_ID));
  });

  test('기본 항목은 득점 항목의 점수를 담고 있다', () => {
    const byName = Object.fromEntries(
      DEFAULT_LOGITEMS.map((i) => [i.name, i.value]),
    );
    expect(byName['3점']).toBe(3);
    expect(byName['2점']).toBe(2);
    expect(byName['자유투1점']).toBe(1);
    expect(byName['어시']).toBe(0);
  });
});
