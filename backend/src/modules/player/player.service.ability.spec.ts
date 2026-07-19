import { NotFoundException } from '@nestjs/common';
import { PlayerService } from './player.service';

describe('PlayerService.getPlayerAbility', () => {
  const makeService = (overrides: any = {}) => {
    const playerRepository = {
      findById: jest.fn().mockResolvedValue({ id: 1, groupId: 7 }),
      ...overrides.playerRepository,
    };
    const abilityRepository = {
      aggregateGroupAbility: jest.fn().mockResolvedValue([
        { playerId: 1, name: '3점', count: 2, valueSum: 6 },
        { playerId: 1, name: '어시', count: 4, valueSum: 0 },
        { playerId: 1, name: '리바', count: 2, valueSum: 0 },
        { playerId: 1, name: '스틸', count: 1, valueSum: 0 },
        { playerId: 1, name: '턴오버', count: 1, valueSum: 0 },
        { playerId: 2, name: '리바', count: 6, valueSum: 0 },
      ]),
      aggregateGamesPlayed: jest.fn().mockResolvedValue([
        { playerId: 1, gamesPlayed: 2 },
        { playerId: 2, gamesPlayed: 2 },
      ]),
      ...overrides.abilityRepository,
    };
    const service = new PlayerService(
      playerRepository as any,
      {} as any, // inGamePlayersRepository (미사용)
      abilityRepository as any,
    );
    return { service, playerRepository, abilityRepository };
  };

  it('선수 그룹으로 능력치를 집계해 반환', async () => {
    const { service, abilityRepository } = makeService();
    const result = await service.getPlayerAbility(1);
    expect(abilityRepository.aggregateGroupAbility).toHaveBeenCalledWith(7);
    expect(result.playerId).toBe(1);
    expect(result.groupId).toBe(7);
    expect(result.axes.length).toBeGreaterThanOrEqual(3);
  });

  it('선수가 없으면 404', async () => {
    const { service } = makeService({
      playerRepository: { findById: jest.fn().mockResolvedValue(null) },
    });
    await expect(service.getPlayerAbility(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
