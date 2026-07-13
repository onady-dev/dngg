import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GameService } from './game.service';

// 그룹 소유권 검증에 필요한 최소 스텁만 구성한다.
const createService = (
  game: { id: number; groupId: number } | null,
  ownedIdCount = 1,
) => {
  const gameRepository = {
    findOne: jest.fn().mockResolvedValue(game),
    updateGameStatus: jest.fn().mockResolvedValue({ affected: 1 }),
    deleteGame: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  // 그룹 내 소속 여부 count 조회 스텁 (ownedIdCount=0이면 타 그룹/미존재 id 시나리오)
  const dataSource = {
    getRepository: jest.fn().mockReturnValue({
      count: jest.fn().mockResolvedValue(ownedIdCount),
    }),
  };
  const service = new GameService(
    gameRepository as any,
    {} as any,
    {} as any,
    dataSource as any,
  );
  return { service, gameRepository };
};

describe('GameService 그룹 소유권 검증', () => {
  const OWN_GROUP = 1;
  const OTHER_GROUP = 2;

  describe('updateGameStatus', () => {
    test('내 그룹의 게임이면 상태를 변경한다', async () => {
      const { service, gameRepository } = createService({
        id: 10,
        groupId: OWN_GROUP,
      });

      await service.updateGameStatus(10, 'FINISHED', OWN_GROUP);

      expect(gameRepository.updateGameStatus).toHaveBeenCalledWith(
        10,
        'FINISHED',
      );
    });

    test('다른 그룹의 게임이면 ForbiddenException을 던진다', async () => {
      const { service, gameRepository } = createService({
        id: 10,
        groupId: OTHER_GROUP,
      });

      await expect(
        service.updateGameStatus(10, 'FINISHED', OWN_GROUP),
      ).rejects.toThrow(ForbiddenException);
      expect(gameRepository.updateGameStatus).not.toHaveBeenCalled();
    });

    test('게임이 없으면 NotFoundException을 던진다', async () => {
      const { service } = createService(null);

      await expect(
        service.updateGameStatus(10, 'FINISHED', OWN_GROUP),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteGame', () => {
    test('내 그룹의 게임이면 삭제한다', async () => {
      const { service, gameRepository } = createService({
        id: 10,
        groupId: OWN_GROUP,
      });

      await service.deleteGame(10, OWN_GROUP);

      expect(gameRepository.deleteGame).toHaveBeenCalledWith(10);
    });

    test('다른 그룹의 게임이면 ForbiddenException을 던진다', async () => {
      const { service, gameRepository } = createService({
        id: 10,
        groupId: OTHER_GROUP,
      });

      await expect(service.deleteGame(10, OWN_GROUP)).rejects.toThrow(
        ForbiddenException,
      );
      expect(gameRepository.deleteGame).not.toHaveBeenCalled();
    });
  });

  describe('saveGameAndLogs', () => {
    test('다른 그룹의 기존 게임 id로 덮어쓰면 ForbiddenException을 던진다', async () => {
      const { service } = createService({ id: 10, groupId: OTHER_GROUP });

      await expect(
        service.saveGameAndLogs(
          { id: 10, groupId: OWN_GROUP } as any,
          OWN_GROUP,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    test('다른 그룹의 선수 id가 섞여 있으면 ForbiddenException을 던진다', async () => {
      const { service } = createService(null, 0);

      const dto = {
        groupId: OWN_GROUP,
        homeTeamName: 'home',
        awayTeamName: 'away',
        homePlayers: [{ id: 999 }],
        awayPlayers: [],
        logs: [],
      };

      await expect(
        service.saveGameAndLogs(dto as any, OWN_GROUP),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
