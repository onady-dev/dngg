import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LogService } from './log.service';

// 그룹 소유권 검증에 필요한 최소 스텁만 구성한다.
const createService = (
  game: { id: number; groupId: number } | null,
  ownedIdCount = 1,
) => {
  const logRepository = {
    findLastLogByGameId: jest.fn().mockResolvedValue({ id: 5, sequence: 3 }),
    createLog: jest.fn().mockResolvedValue({ id: 6 }),
    removeLog: jest.fn().mockResolvedValue(undefined),
    findLogByGameIdAndSequence: jest
      .fn()
      .mockResolvedValue({ id: 4, sequence: 2 }),
  };
  const gameRepository = {
    findOne: jest.fn().mockResolvedValue(game),
  };
  // 그룹 내 소속 여부 count 조회 스텁 (ownedIdCount=0이면 타 그룹/미존재 id 시나리오)
  const dataSource = {
    getRepository: jest.fn().mockReturnValue({
      count: jest.fn().mockResolvedValue(ownedIdCount),
    }),
  };
  const service = new LogService(
    logRepository as any,
    gameRepository as any,
    dataSource as any,
  );
  return { service, logRepository };
};

describe('LogService 그룹 소유권 검증', () => {
  const OWN_GROUP = 1;
  const OTHER_GROUP = 2;
  const GAME_ID = 10;

  const dto = {
    groupId: OWN_GROUP,
    gameId: GAME_ID,
    playerId: 100,
    logitemId: 200,
  };

  describe('createLog', () => {
    test('내 그룹의 게임이면 로그를 생성한다', async () => {
      const { service, logRepository } = createService({
        id: GAME_ID,
        groupId: OWN_GROUP,
      });

      await service.createLog(dto as any, OWN_GROUP);

      expect(logRepository.createLog).toHaveBeenCalled();
    });

    test('다른 그룹의 게임이면 ForbiddenException을 던진다', async () => {
      const { service, logRepository } = createService({
        id: GAME_ID,
        groupId: OTHER_GROUP,
      });

      await expect(service.createLog(dto as any, OWN_GROUP)).rejects.toThrow(
        ForbiddenException,
      );
      expect(logRepository.createLog).not.toHaveBeenCalled();
    });

    test('게임이 없으면 NotFoundException을 던진다', async () => {
      const { service } = createService(null);

      await expect(service.createLog(dto as any, OWN_GROUP)).rejects.toThrow(
        NotFoundException,
      );
    });

    test('다른 그룹의 선수/기록 항목 id면 ForbiddenException을 던진다', async () => {
      const { service, logRepository } = createService(
        { id: GAME_ID, groupId: OWN_GROUP },
        0,
      );

      await expect(service.createLog(dto as any, OWN_GROUP)).rejects.toThrow(
        ForbiddenException,
      );
      expect(logRepository.createLog).not.toHaveBeenCalled();
    });
  });

  describe('undoLastLog', () => {
    test('다른 그룹의 게임이면 ForbiddenException을 던진다', async () => {
      const { service, logRepository } = createService({
        id: GAME_ID,
        groupId: OTHER_GROUP,
      });

      await expect(service.undoLastLog(GAME_ID, OWN_GROUP)).rejects.toThrow(
        ForbiddenException,
      );
      expect(logRepository.removeLog).not.toHaveBeenCalled();
    });

    test('내 그룹의 게임이면 마지막 로그를 삭제한다', async () => {
      const { service, logRepository } = createService({
        id: GAME_ID,
        groupId: OWN_GROUP,
      });

      await service.undoLastLog(GAME_ID, OWN_GROUP);

      expect(logRepository.removeLog).toHaveBeenCalledWith(5);
    });
  });

  describe('redoLog', () => {
    test('다른 그룹의 게임이면 ForbiddenException을 던진다', async () => {
      const { service, logRepository } = createService({
        id: GAME_ID,
        groupId: OTHER_GROUP,
      });

      await expect(service.redoLog(GAME_ID, 2, OWN_GROUP)).rejects.toThrow(
        ForbiddenException,
      );
      expect(logRepository.createLog).not.toHaveBeenCalled();
    });
  });
});
