import { NotFoundException } from '@nestjs/common';
import { PlayerService } from './player.service';

describe('PlayerService.getPlayerTeamImpact', () => {
  const makeService = (overrides: any = {}) => {
    const playerRepository = {
      findById: jest.fn().mockResolvedValue({ id: 1, groupId: 7 }),
      ...overrides.playerRepository,
    };
    const teamImpactRepository = {
      findFinishedGames: jest
        .fn()
        .mockResolvedValue([{ gameId: 1, team: 'home', date: '2026-07-08' }]),
      aggregateTeamByItem: jest.fn().mockResolvedValue([
        { gameId: 1, team: 'home', name: '2점', count: 6, valueSum: 12 },
        { gameId: 1, team: 'away', name: '2점', count: 5, valueSum: 10 },
      ]),
      aggregateSelfByItem: jest
        .fn()
        .mockResolvedValue([{ gameId: 1, name: '2점', count: 2, valueSum: 4 }]),
      findTeammates: jest.fn().mockResolvedValue([]),
      ...overrides.teamImpactRepository,
    };
    const service = new PlayerService(
      playerRepository,
      {} as any, // inGamePlayersRepository (미사용)
      {} as any, // abilityRepository (미사용)
      teamImpactRepository,
    );
    return { service, playerRepository, teamImpactRepository };
  };

  it('완료 경기 집계로 팀 기여도를 계산해 반환', async () => {
    const { service, teamImpactRepository } = makeService();
    const result = await service.getPlayerTeamImpact(1);
    expect(teamImpactRepository.findFinishedGames).toHaveBeenCalledWith(1, undefined);
    expect(teamImpactRepository.aggregateTeamByItem).toHaveBeenCalledWith([1]);
    expect(result.playerId).toBe(1);
    expect(result.groupId).toBe(7);
    expect(result.finishedGames).toBe(1);
    expect(result.record).toEqual({ wins: 1, draws: 0, losses: 0 }); // 12 > 10 승
    expect(result.winRate).toBe(100);
  });

  it('선수가 없으면 404이며 집계를 호출하지 않는다', async () => {
    const { service, teamImpactRepository } = makeService({
      playerRepository: { findById: jest.fn().mockResolvedValue(null) },
    });
    await expect(service.getPlayerTeamImpact(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(teamImpactRepository.findFinishedGames).not.toHaveBeenCalled();
  });
});
