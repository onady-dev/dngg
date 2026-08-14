import { ForbiddenException } from '@nestjs/common';
import { SeasonController } from './season.controller';

const OWN_GROUP = 1;
const OTHER_GROUP = 2;

const createController = () => {
  const service = {
    createSeason: jest.fn().mockResolvedValue({ id: 10 }),
    getSeasons: jest.fn().mockResolvedValue({ seasons: [], currentSeasonId: null }),
    renameSeason: jest.fn().mockResolvedValue({ id: 10 }),
    deleteSeason: jest.fn().mockResolvedValue({ affectedGames: 0 }),
    setCurrentSeason: jest.fn().mockResolvedValue({ currentSeasonId: 10 }),
  };
  const controller = new SeasonController(service as any);
  return { controller, service };
};

const req = (groupId: number) => ({ user: { groupId } });

describe('SeasonController 그룹 소유권 검증', () => {
  test('다른 그룹 id로 시즌을 만들 수 없다', async () => {
    const { controller, service } = createController();

    await expect(
      controller.createSeason(req(OWN_GROUP), {
        groupId: OTHER_GROUP,
        name: '2026 봄',
      } as any),
    ).rejects.toThrow(ForbiddenException);
    expect(service.createSeason).not.toHaveBeenCalled();
  });

  test('다른 그룹 id로 현재 시즌을 지정할 수 없다', async () => {
    const { controller, service } = createController();

    await expect(
      controller.setCurrentSeason(req(OWN_GROUP), {
        groupId: OTHER_GROUP,
        seasonId: 10,
      } as any),
    ).rejects.toThrow(ForbiddenException);
    expect(service.setCurrentSeason).not.toHaveBeenCalled();
  });

  test('삭제는 쿼리가 아니라 JWT의 groupId로 소유권을 판정한다', async () => {
    const { controller, service } = createController();

    await controller.deleteSeason(req(OWN_GROUP), 10);

    expect(service.deleteSeason).toHaveBeenCalledWith(10, OWN_GROUP);
  });

  test('내 그룹이면 시즌을 만든다', async () => {
    const { controller, service } = createController();

    await controller.createSeason(req(OWN_GROUP), {
      groupId: OWN_GROUP,
      name: '2026 봄',
    } as any);

    expect(service.createSeason).toHaveBeenCalledWith({
      groupId: OWN_GROUP,
      name: '2026 봄',
    });
  });
});
