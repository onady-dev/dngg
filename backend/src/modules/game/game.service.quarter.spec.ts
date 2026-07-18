import {
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { GameService } from './game.service';

// 쿼터 전환에 필요한 최소 스텁만 구성한다.
const createService = (
  game: { id: number; groupId: number; status: string } | null,
) => {
  const gameRepository = {
    findOne: jest.fn().mockResolvedValue(game),
    updateGameQuarter: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const service = new GameService(
    gameRepository as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, gameRepository };
};

describe('GameService.updateGameQuarter', () => {
  const OWN_GROUP = 1;
  const OTHER_GROUP = 2;
  const GAME_ID = 10;

  test('내 그룹의 진행 중 게임이면 쿼터를 갱신한다', async () => {
    const { service, gameRepository } = createService({
      id: GAME_ID,
      groupId: OWN_GROUP,
      status: 'IN_PROGRESS',
    });

    await service.updateGameQuarter(GAME_ID, 2, OWN_GROUP);

    expect(gameRepository.updateGameQuarter).toHaveBeenCalledWith(GAME_ID, 2);
  });

  test('종료된 게임이면 400을 던진다', async () => {
    const { service, gameRepository } = createService({
      id: GAME_ID,
      groupId: OWN_GROUP,
      status: 'FINISHED',
    });

    await expect(
      service.updateGameQuarter(GAME_ID, 2, OWN_GROUP),
    ).rejects.toThrow(HttpException);
    expect(gameRepository.updateGameQuarter).not.toHaveBeenCalled();
  });

  test('삭제된 게임이면 400을 던진다', async () => {
    const { service, gameRepository } = createService({
      id: GAME_ID,
      groupId: OWN_GROUP,
      status: 'DELETED',
    });

    await expect(
      service.updateGameQuarter(GAME_ID, 2, OWN_GROUP),
    ).rejects.toThrow(HttpException);
    expect(gameRepository.updateGameQuarter).not.toHaveBeenCalled();
  });

  test('다른 그룹의 게임이면 ForbiddenException을 던진다', async () => {
    const { service, gameRepository } = createService({
      id: GAME_ID,
      groupId: OTHER_GROUP,
      status: 'IN_PROGRESS',
    });

    await expect(
      service.updateGameQuarter(GAME_ID, 2, OWN_GROUP),
    ).rejects.toThrow(ForbiddenException);
    expect(gameRepository.updateGameQuarter).not.toHaveBeenCalled();
  });

  test('게임이 없으면 NotFoundException을 던진다', async () => {
    const { service } = createService(null);

    await expect(
      service.updateGameQuarter(GAME_ID, 2, OWN_GROUP),
    ).rejects.toThrow(NotFoundException);
  });
});
