import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Log } from 'src/entities/Log.entity';
import { AbilityRow, GamesPlayed } from 'src/modules/player/ability.types';

@Injectable()
export class AbilityRepository {
  constructor(
    @InjectRepository(Log)
    private readonly logRepository: Repository<Log>,
  ) {}

  // 그룹 전체를 (선수 x logitem 이름)으로 집계. 삭제 게임/삭제 선수 제외.
  async aggregateGroupAbility(groupId: number): Promise<AbilityRow[]> {
    const rows = await this.logRepository
      .createQueryBuilder('log')
      .innerJoin('log.logitem', 'logitem')
      .innerJoin('log.game', 'game')
      .innerJoin('log.player', 'player') // FK 제거 정책: INNER JOIN으로 삭제 선수 로그 제외
      .select('log.playerId', 'playerId')
      .addSelect('logitem.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(logitem.value)', 'valueSum')
      .where('log.groupId = :groupId', { groupId })
      .andWhere("game.status != 'DELETED'")
      .groupBy('log.playerId')
      .addGroupBy('logitem.name')
      .getRawMany();

    return rows.map((r) => ({
      playerId: Number(r.playerId),
      name: r.name,
      count: Number(r.count),
      valueSum: Number(r.valueSum),
    }));
  }

  // 선수별 참여(로그 존재) 게임 수. 삭제 게임/삭제 선수 제외.
  async aggregateGamesPlayed(groupId: number): Promise<GamesPlayed[]> {
    const rows = await this.logRepository
      .createQueryBuilder('log')
      .innerJoin('log.game', 'game')
      .innerJoin('log.player', 'player')
      .select('log.playerId', 'playerId')
      .addSelect('COUNT(DISTINCT log.gameId)', 'gamesPlayed')
      .where('log.groupId = :groupId', { groupId })
      .andWhere("game.status != 'DELETED'")
      .groupBy('log.playerId')
      .getRawMany();

    return rows.map((r) => ({
      playerId: Number(r.playerId),
      gamesPlayed: Number(r.gamesPlayed),
    }));
  }
}
