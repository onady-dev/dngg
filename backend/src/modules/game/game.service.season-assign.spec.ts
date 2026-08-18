import { ForbiddenException } from '@nestjs/common';
import { GameService } from './game.service';
import { Season } from 'src/entities/Season.entity';

const OWN_GROUP = 1;
const SEASON_ID = 7;
const GAME_IDS = [10, 11, 12];

// assertIdsInGroup은 repository.count({ where })만 쓴다.
// count가 요청한 id 개수와 같으면 통과, 다르면 ForbiddenException.
const createService = (
  options: {
    gameCount?: number; // 그룹 소유로 확인된 경기 수
    seasonCount?: number; // 그룹 소유로 확인된 시즌 수
    affected?: number;
  } = {},
) => {
  const gameRepository = {
    count: jest.fn().mockResolvedValue(options.gameCount ?? GAME_IDS.length),
    updateSeason: jest
      .fn()
      .mockResolvedValue(options.affected ?? GAME_IDS.length),
  };
  const seasonRepository = {
    count: jest.fn().mockResolvedValue(options.seasonCount ?? 1),
  };
  const dataSource = {
    getRepository: jest
      .fn()
      .mockImplementation((entity: any) =>
        entity === Season ? seasonRepository : gameRepository,
      ),
  };
  const service = new GameService(
    gameRepository as any,
    {} as any, // inGamePlayersRepository (미사용)
    {} as any, // logRepository (미사용)
    dataSource as any,
  );
  return { service, gameRepository, seasonRepository };
};

describe('GameService.assignSeason', () => {
  test('경기와 시즌이 모두 내 그룹이면 배정하고 바뀐 행 수를 돌려준다', async () => {
    const { service, gameRepository } = createService();

    const result = await service.assignSeason({
      groupId: OWN_GROUP,
      gameIds: GAME_IDS,
      seasonId: SEASON_ID,
    });

    expect(gameRepository.updateSeason).toHaveBeenCalledWith(
      OWN_GROUP,
      GAME_IDS,
      SEASON_ID,
    );
    expect(result).toEqual({ updated: 3 });
  });

  test('다른 그룹의 경기가 섞이면 거부하고 아무것도 바꾸지 않는다', async () => {
    // 3개를 요청했는데 내 그룹 소유는 2개뿐 → assertIdsInGroup이 던진다
    const { service, gameRepository } = createService({ gameCount: 2 });

    await expect(
      service.assignSeason({
        groupId: OWN_GROUP,
        gameIds: GAME_IDS,
        seasonId: SEASON_ID,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(gameRepository.updateSeason).not.toHaveBeenCalled();
  });

  test('다른 그룹의 시즌이면 거부하고 아무것도 바꾸지 않는다', async () => {
    const { service, gameRepository } = createService({ seasonCount: 0 });

    await expect(
      service.assignSeason({
        groupId: OWN_GROUP,
        gameIds: GAME_IDS,
        seasonId: SEASON_ID,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(gameRepository.updateSeason).not.toHaveBeenCalled();
  });

  test('seasonId가 null이면 시즌 조회 없이 시즌 미지정으로 되돌린다', async () => {
    const { service, gameRepository, seasonRepository } = createService();

    const result = await service.assignSeason({
      groupId: OWN_GROUP,
      gameIds: GAME_IDS,
      seasonId: null,
    });

    expect(seasonRepository.count).not.toHaveBeenCalled();
    expect(gameRepository.updateSeason).toHaveBeenCalledWith(
      OWN_GROUP,
      GAME_IDS,
      null,
    );
    expect(result).toEqual({ updated: 3 });
  });

  test('실제로 바뀐 행 수가 요청보다 적어도 그 수를 그대로 돌려준다', async () => {
    // 삭제된 경기가 섞여 UPDATE의 WHERE에서 빠진 경우
    const { service } = createService({ affected: 2 });

    const result = await service.assignSeason({
      groupId: OWN_GROUP,
      gameIds: GAME_IDS,
      seasonId: SEASON_ID,
    });

    expect(result).toEqual({ updated: 2 });
  });
});
