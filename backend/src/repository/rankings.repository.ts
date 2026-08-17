import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Log } from 'src/entities/Log.entity';
import { RankingAggRow } from 'src/modules/log/rankings.types';

@Injectable()
export class RankingsRepository {
  constructor(
    @InjectRepository(Log)
    private readonly logRepository: Repository<Log>,
  ) {}

  // (선수 x 기록항목) 집계. 삭제 게임/삭제 선수는 제외한다.
  // seasonId가 없으면 전체(시즌 미지정 경기 포함)를 집계한다.
  async aggregateRankings(
    groupId: number,
    seasonId?: number | null,
  ): Promise<RankingAggRow[]> {
    const query = this.logRepository
      .createQueryBuilder('log')
      .innerJoin('log.logitem', 'logitem')
      .innerJoin('log.game', 'game')
      .innerJoin('log.player', 'player') // FK 제거 정책: 삭제 선수 제외
      .select('log.playerId', 'playerId')
      .addSelect('player.name', 'playerName')
      .addSelect('player.backnumber', 'backnumber')
      .addSelect('logitem.id', 'logitemId')
      .addSelect('logitem.name', 'logitemName')
      .addSelect('logitem.value', 'logitemValue')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(logitem.value)', 'valueSum')
      .where('log.groupId = :groupId', { groupId: Number(groupId) })
      .andWhere("game.status != 'DELETED'");

    if (seasonId !== undefined && seasonId !== null) {
      query.andWhere('game.seasonId = :seasonId', {
        seasonId: Number(seasonId),
      });
    }

    const rows = await query
      .groupBy('log.playerId')
      .addGroupBy('player.name')
      .addGroupBy('player.backnumber')
      .addGroupBy('logitem.id')
      .addGroupBy('logitem.name')
      .addGroupBy('logitem.value')
      .orderBy('logitem.id', 'ASC')
      .getRawMany();

    return rows.map((r) => ({
      playerId: Number(r.playerId),
      playerName: r.playerName,
      backnumber: r.backnumber ?? null,
      logitemId: Number(r.logitemId),
      logitemName: r.logitemName,
      logitemValue: Number(r.logitemValue),
      count: Number(r.count),
      valueSum: Number(r.valueSum),
    }));
  }
}
