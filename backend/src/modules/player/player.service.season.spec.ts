import { PlayerService } from './player.service';

const PLAYER_ID = 1;
const GROUP_ID = 7;
const SEASON_ID = 42;

const makeService = () => {
  const playerRepository = {
    findById: jest.fn().mockResolvedValue({ id: PLAYER_ID, groupId: GROUP_ID }),
  };
  const abilityRepository = {
    aggregateGroupAbility: jest.fn().mockResolvedValue([]),
    aggregateGamesPlayed: jest.fn().mockResolvedValue([]),
  };
  const teamImpactRepository = {
    findFinishedGames: jest.fn().mockResolvedValue([]),
    aggregateTeamByItem: jest.fn().mockResolvedValue([]),
    aggregateSelfByItem: jest.fn().mockResolvedValue([]),
    findTeammates: jest.fn().mockResolvedValue([]),
  };
  const service = new PlayerService(
    playerRepository as any,
    {} as any, // inGamePlayersRepository (미사용)
    abilityRepository as any,
    teamImpactRepository as any,
  );
  return { service, abilityRepository, teamImpactRepository };
};

describe('PlayerService 시즌 필터', () => {
  test('능력치 집계에 seasonId를 전달한다', async () => {
    const { service, abilityRepository } = makeService();

    await service.getPlayerAbility(PLAYER_ID, SEASON_ID);

    expect(abilityRepository.aggregateGroupAbility).toHaveBeenCalledWith(
      GROUP_ID,
      SEASON_ID,
    );
    expect(abilityRepository.aggregateGamesPlayed).toHaveBeenCalledWith(
      GROUP_ID,
      SEASON_ID,
    );
  });

  test('seasonId가 없으면 undefined를 전달한다 (전체 집계)', async () => {
    const { service, abilityRepository } = makeService();

    await service.getPlayerAbility(PLAYER_ID);

    expect(abilityRepository.aggregateGroupAbility).toHaveBeenCalledWith(
      GROUP_ID,
      undefined,
    );
  });

  test('팀 기여도의 완료 경기 조회에 seasonId를 전달한다', async () => {
    const { service, teamImpactRepository } = makeService();

    await service.getPlayerTeamImpact(PLAYER_ID, SEASON_ID);

    expect(teamImpactRepository.findFinishedGames).toHaveBeenCalledWith(
      PLAYER_ID,
      SEASON_ID,
    );
  });
});
