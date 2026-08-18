import { ForbiddenException } from '@nestjs/common';
import { GameController } from './game.controller';

const OWN_GROUP = 1;
const OTHER_GROUP = 2;

const createController = () => {
  const service = {
    assignSeason: jest.fn().mockResolvedValue({ updated: 3 }),
  };
  const controller = new GameController(service as any);
  return { controller, service };
};

const req = (groupId: number) => ({ user: { groupId } });

describe('GameController.assignSeason', () => {
  test('다른 그룹 id로는 배정할 수 없다', async () => {
    const { controller, service } = createController();

    await expect(
      controller.assignSeason(req(OWN_GROUP), {
        groupId: OTHER_GROUP,
        gameIds: [10],
        seasonId: 7,
      } as any),
    ).rejects.toThrow(ForbiddenException);
    expect(service.assignSeason).not.toHaveBeenCalled();
  });

  test('내 그룹이면 서비스에 그대로 넘긴다', async () => {
    const { controller, service } = createController();

    const result = await controller.assignSeason(req(OWN_GROUP), {
      groupId: OWN_GROUP,
      gameIds: [10, 11, 12],
      seasonId: 7,
    } as any);

    expect(service.assignSeason).toHaveBeenCalledWith({
      groupId: OWN_GROUP,
      gameIds: [10, 11, 12],
      seasonId: 7,
    });
    expect(result).toEqual({ updated: 3 });
  });

  test('seasonId가 null이어도 그대로 넘긴다', async () => {
    const { controller, service } = createController();

    await controller.assignSeason(req(OWN_GROUP), {
      groupId: OWN_GROUP,
      gameIds: [10],
      seasonId: null,
    } as any);

    expect(service.assignSeason).toHaveBeenCalledWith({
      groupId: OWN_GROUP,
      gameIds: [10],
      seasonId: null,
    });
  });
});
