import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SeasonService } from './season.service';
import { Game } from 'src/entities/Game.entity';
import { Group } from 'src/entities/Group.entity';
import { Season } from 'src/entities/Season.entity';

const OWN_GROUP = 1;
const OTHER_GROUP = 2;
const SEASON_ID = 10;

// 실제 DB 없이 리포지토리 스텁만 구성한다 (player.service.group-access.spec.ts 패턴).
const createService = (
  season: { id: number; groupId: number; name: string } | null = {
    id: SEASON_ID,
    groupId: OWN_GROUP,
    name: '2026 봄',
  },
) => {
  const seasonRepository = {
    findByGroupId: jest.fn().mockResolvedValue([season].filter(Boolean)),
    findById: jest.fn().mockResolvedValue(season),
    saveSeason: jest.fn().mockImplementation((s) => Promise.resolve({ ...s, id: SEASON_ID })),
    updateName: jest.fn().mockResolvedValue(undefined),
  };
  const groupRepository = {
    findOne: jest.fn().mockResolvedValue({ id: OWN_GROUP, currentSeasonId: null }),
  };
  const dataSource = { transaction: jest.fn() };
  const service = new SeasonService(
    seasonRepository as any,
    groupRepository as any,
    dataSource as any,
  );
  return { service, seasonRepository, groupRepository };
};

describe('SeasonService.createSeason', () => {
  test('그룹과 이름으로 시즌을 저장한다', async () => {
    const { service, seasonRepository } = createService();

    const result = await service.createSeason({ groupId: OWN_GROUP, name: '2026 봄' });

    expect(seasonRepository.saveSeason).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: OWN_GROUP, name: '2026 봄' }),
    );
    expect(result.id).toBe(SEASON_ID);
  });
});

describe('SeasonService.getSeasons', () => {
  test('시즌 목록과 그룹의 현재 시즌 id를 함께 반환한다', async () => {
    const { service, groupRepository } = createService();
    groupRepository.findOne.mockResolvedValue({ id: OWN_GROUP, currentSeasonId: SEASON_ID });

    const result = await service.getSeasons(OWN_GROUP);

    expect(result.seasons).toHaveLength(1);
    expect(result.currentSeasonId).toBe(SEASON_ID);
  });

  test('그룹이 없으면 currentSeasonId는 null이다', async () => {
    const { service, groupRepository } = createService();
    groupRepository.findOne.mockResolvedValue(null);

    const result = await service.getSeasons(OWN_GROUP);

    expect(result.currentSeasonId).toBeNull();
  });
});

describe('SeasonService.renameSeason', () => {
  test('다른 그룹의 시즌이면 ForbiddenException을 던진다', async () => {
    const { service, seasonRepository } = createService({
      id: SEASON_ID,
      groupId: OTHER_GROUP,
      name: '남의 시즌',
    });

    await expect(
      service.renameSeason(SEASON_ID, OWN_GROUP, '바꾼 이름'),
    ).rejects.toThrow(ForbiddenException);
    expect(seasonRepository.updateName).not.toHaveBeenCalled();
  });

  test('시즌이 없으면 NotFoundException을 던진다', async () => {
    const { service } = createService(null);

    await expect(
      service.renameSeason(SEASON_ID, OWN_GROUP, '바꾼 이름'),
    ).rejects.toThrow(NotFoundException);
  });

  test('내 그룹의 시즌이면 이름을 바꾼다', async () => {
    const { service, seasonRepository } = createService();

    await service.renameSeason(SEASON_ID, OWN_GROUP, '2026 여름');

    expect(seasonRepository.updateName).toHaveBeenCalledWith(SEASON_ID, '2026 여름');
  });
});

// 트랜잭션 안에서 manager.update / manager.delete 호출을 검증하기 위한 스텁.
const createTxService = (
  season: { id: number; groupId: number; name: string } | null = {
    id: SEASON_ID,
    groupId: OWN_GROUP,
    name: '2026 봄',
  },
  group: { id: number; currentSeasonId: number | null } | null = {
    id: OWN_GROUP,
    currentSeasonId: SEASON_ID,
  },
) => {
  const manager = {
    update: jest.fn().mockResolvedValue({ affected: 3 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const seasonRepository = {
    findById: jest.fn().mockResolvedValue(season),
  };
  const groupRepository = {
    findOne: jest.fn().mockResolvedValue(group),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const dataSource = {
    transaction: jest.fn().mockImplementation((cb) => cb(manager)),
  };
  const service = new SeasonService(
    seasonRepository as any,
    groupRepository as any,
    dataSource as any,
  );
  return { service, manager, seasonRepository, groupRepository };
};

describe('SeasonService.deleteSeason', () => {
  test('다른 그룹의 시즌이면 ForbiddenException을 던지고 아무것도 지우지 않는다', async () => {
    const { service, manager } = createTxService({
      id: SEASON_ID,
      groupId: OTHER_GROUP,
      name: '남의 시즌',
    });

    await expect(service.deleteSeason(SEASON_ID, OWN_GROUP)).rejects.toThrow(
      ForbiddenException,
    );
    expect(manager.delete).not.toHaveBeenCalled();
  });

  test('경기의 seasonId를 null로 되돌린 뒤 시즌을 지운다', async () => {
    const { service, manager } = createTxService();

    const result = await service.deleteSeason(SEASON_ID, OWN_GROUP);

    // 경기 복원이 시즌 삭제보다 먼저 일어나야 한다
    expect(manager.update).toHaveBeenCalledWith(
      Game,
      { seasonId: SEASON_ID },
      { seasonId: null },
    );
    expect(manager.delete).toHaveBeenCalledWith(Season, { id: SEASON_ID });
    expect(result.affectedGames).toBe(3);
  });

  test('삭제 대상이 현재 시즌이면 그룹의 currentSeasonId도 null로 만든다', async () => {
    const { service, manager } = createTxService();

    await service.deleteSeason(SEASON_ID, OWN_GROUP);

    expect(manager.update).toHaveBeenCalledWith(
      Group,
      { id: OWN_GROUP },
      { currentSeasonId: null },
    );
  });

  test('삭제 대상이 현재 시즌이 아니면 currentSeasonId를 건드리지 않는다', async () => {
    const { service, manager } = createTxService(
      { id: SEASON_ID, groupId: OWN_GROUP, name: '2026 봄' },
      { id: OWN_GROUP, currentSeasonId: 999 },
    );

    await service.deleteSeason(SEASON_ID, OWN_GROUP);

    expect(manager.update).not.toHaveBeenCalledWith(
      Group,
      expect.anything(),
      { currentSeasonId: null },
    );
  });
});

describe('SeasonService.setCurrentSeason', () => {
  test('다른 그룹의 시즌은 현재 시즌으로 지정할 수 없다', async () => {
    const { service, groupRepository } = createTxService({
      id: SEASON_ID,
      groupId: OTHER_GROUP,
      name: '남의 시즌',
    });

    await expect(
      service.setCurrentSeason(OWN_GROUP, SEASON_ID),
    ).rejects.toThrow(ForbiddenException);
    expect(groupRepository.update).not.toHaveBeenCalled();
  });

  test('내 그룹의 시즌이면 현재 시즌으로 지정한다', async () => {
    const { service, groupRepository } = createTxService();

    const result = await service.setCurrentSeason(OWN_GROUP, SEASON_ID);

    expect(groupRepository.update).toHaveBeenCalledWith(OWN_GROUP, {
      currentSeasonId: SEASON_ID,
    });
    expect(result.currentSeasonId).toBe(SEASON_ID);
  });

  test('null이면 시즌 조회 없이 현재 시즌을 해제한다', async () => {
    const { service, groupRepository, seasonRepository } = createTxService();

    const result = await service.setCurrentSeason(OWN_GROUP, null);

    expect(seasonRepository.findById).not.toHaveBeenCalled();
    expect(groupRepository.update).toHaveBeenCalledWith(OWN_GROUP, {
      currentSeasonId: null,
    });
    expect(result.currentSeasonId).toBeNull();
  });
});
