import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PlayerService } from './player.service';

// 그룹 소유권 검증에 필요한 최소 스텁만 구성한다.
const createService = (player: { id: number; groupId: number } | null) => {
  const playerRepository = {
    findById: jest.fn().mockResolvedValue(player),
    updatePlayer: jest.fn().mockResolvedValue(undefined),
    deletePlayer: jest.fn().mockResolvedValue(undefined),
  };
  const service = new PlayerService(playerRepository as any, {} as any);
  return { service, playerRepository };
};

describe('PlayerService 그룹 소유권 검증', () => {
  const OWN_GROUP = 1;
  const OTHER_GROUP = 2;
  const PLAYER_ID = 100;

  const dto = { groupId: OWN_GROUP, name: '선수', backnumber: '7' };

  describe('updatePlayer', () => {
    test('다른 그룹의 선수면 ForbiddenException을 던진다', async () => {
      const { service, playerRepository } = createService({
        id: PLAYER_ID,
        groupId: OTHER_GROUP,
      });

      await expect(
        service.updatePlayer(PLAYER_ID, dto as any, OWN_GROUP),
      ).rejects.toThrow(ForbiddenException);
      expect(playerRepository.updatePlayer).not.toHaveBeenCalled();
    });

    test('내 그룹의 선수면 수정한다', async () => {
      const { service, playerRepository } = createService({
        id: PLAYER_ID,
        groupId: OWN_GROUP,
      });

      await service.updatePlayer(PLAYER_ID, dto as any, OWN_GROUP);

      expect(playerRepository.updatePlayer).toHaveBeenCalled();
    });
  });

  describe('deletePlayer', () => {
    test('다른 그룹의 선수면 ForbiddenException을 던진다', async () => {
      const { service, playerRepository } = createService({
        id: PLAYER_ID,
        groupId: OTHER_GROUP,
      });

      await expect(service.deletePlayer(PLAYER_ID, OWN_GROUP)).rejects.toThrow(
        ForbiddenException,
      );
      expect(playerRepository.deletePlayer).not.toHaveBeenCalled();
    });

    test('선수가 없으면 NotFoundException을 던진다', async () => {
      const { service } = createService(null);

      await expect(service.deletePlayer(PLAYER_ID, OWN_GROUP)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
