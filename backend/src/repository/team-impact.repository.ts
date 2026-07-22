import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Log } from 'src/entities/Log.entity';
import { InGamePlayer } from 'src/entities/InGamePlayer.entity';
import {
  GameRow,
  TeamAggRow,
  SelfAggRow,
  RosterRow,
} from 'src/modules/player/team-impact.types';

@Injectable()
export class TeamImpactRepository {
  constructor(
    @InjectRepository(Log)
    private readonly logRepository: Repository<Log>,
  ) {}

  // 대상 선수의 완료(FINISHED) 경기 + 소속 팀 + 날짜
  async findFinishedGames(playerId: number): Promise<GameRow[]> {
    const rows = await this.logRepository.manager
      .createQueryBuilder(InGamePlayer, 'igp')
      .innerJoin('igp.game', 'game')
      .select('igp.gameId', 'gameId')
      .addSelect('igp.team', 'team')
      .addSelect('game.date', 'date')
      .where('igp.playerId = :playerId', { playerId })
      .andWhere("game.status = 'FINISHED'")
      .getRawMany();
    return rows.map((r) => ({
      gameId: Number(r.gameId),
      team: r.team,
      date: String(r.date),
    }));
  }

  // 게임별·팀별·항목별 집계 (삭제 선수 로그 제외)
  async aggregateTeamByItem(gameIds: number[]): Promise<TeamAggRow[]> {
    if (gameIds.length === 0) return [];
    const rows = await this.logRepository
      .createQueryBuilder('log')
      .innerJoin('log.logitem', 'logitem')
      .innerJoin('log.player', 'player') // FK 제거 정책: 삭제 선수 제외
      .innerJoin(
        InGamePlayer,
        'igp',
        'igp.gameId = log.gameId AND igp.playerId = log.playerId',
      )
      .select('log.gameId', 'gameId')
      .addSelect('igp.team', 'team')
      .addSelect('logitem.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(logitem.value)', 'valueSum')
      .where('log.gameId IN (:...gameIds)', { gameIds })
      .groupBy('log.gameId')
      .addGroupBy('igp.team')
      .addGroupBy('logitem.name')
      .getRawMany();
    return rows.map((r) => ({
      gameId: Number(r.gameId),
      team: r.team,
      name: r.name,
      count: Number(r.count),
      valueSum: Number(r.valueSum),
    }));
  }

  // 대상 선수 본인의 게임별·항목별 집계
  async aggregateSelfByItem(
    playerId: number,
    gameIds: number[],
  ): Promise<SelfAggRow[]> {
    if (gameIds.length === 0) return [];
    const rows = await this.logRepository
      .createQueryBuilder('log')
      .innerJoin('log.logitem', 'logitem')
      .select('log.gameId', 'gameId')
      .addSelect('logitem.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(logitem.value)', 'valueSum')
      .where('log.playerId = :playerId', { playerId })
      .andWhere('log.gameId IN (:...gameIds)', { gameIds })
      .groupBy('log.gameId')
      .addGroupBy('logitem.name')
      .getRawMany();
    return rows.map((r) => ({
      gameId: Number(r.gameId),
      name: r.name,
      count: Number(r.count),
      valueSum: Number(r.valueSum),
    }));
  }

  // 케미용: 완료 경기의 (본인 제외) 동료 로스터 (삭제 동료 제외)
  async findTeammates(
    playerId: number,
    gameIds: number[],
  ): Promise<RosterRow[]> {
    if (gameIds.length === 0) return [];
    const rows = await this.logRepository.manager
      .createQueryBuilder(InGamePlayer, 'igp')
      .innerJoin('igp.player', 'player') // 삭제 동료 제외 (이름 필요)
      .select('igp.gameId', 'gameId')
      .addSelect('igp.team', 'team')
      .addSelect('igp.playerId', 'playerId')
      .addSelect('player.name', 'name')
      .where('igp.gameId IN (:...gameIds)', { gameIds })
      .andWhere('igp.playerId != :playerId', { playerId })
      .getRawMany();
    return rows.map((r) => ({
      gameId: Number(r.gameId),
      team: r.team,
      playerId: Number(r.playerId),
      name: r.name,
    }));
  }
}
