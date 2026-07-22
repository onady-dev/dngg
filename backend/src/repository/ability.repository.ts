import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Log } from 'src/entities/Log.entity';
import { InGamePlayer } from 'src/entities/InGamePlayer.entity';
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

  // 선수별 총 출전 게임 수. InGamePlayer 로스터 기준(기록 유무 무관), 삭제 게임/삭제 선수 제외.
  async aggregateGamesPlayed(groupId: number): Promise<GamesPlayed[]> {
    const rows = await this.logRepository.manager
      .createQueryBuilder(InGamePlayer, 'igp')
      .innerJoin('igp.game', 'game')
      .innerJoin('igp.player', 'player') // FK 제거 정책: INNER JOIN으로 삭제 선수 제외
      .select('igp.playerId', 'playerId')
      .addSelect('COUNT(DISTINCT igp.gameId)', 'gamesPlayed')
      .where('igp.groupId = :groupId', { groupId })
      .andWhere("game.status != 'DELETED'")
      .groupBy('igp.playerId')
      .getRawMany();

    return rows.map((r) => ({
      playerId: Number(r.playerId),
      gamesPlayed: Number(r.gamesPlayed),
    }));
  }
}
