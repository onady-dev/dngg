import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { LogRepository } from 'src/repository/log.repository';
import { GameRepository } from 'src/repository/game.repository';
import { PostLogRequestDto } from './log.request.dto';
import { plainToInstance } from 'class-transformer';
import { Log } from 'src/entities/Log.entity';
import { Player as PlayerEntity } from 'src/entities/Player.entity';
import { Logitem } from 'src/entities/Logitem.entity';
import { InGamePlayer } from 'src/entities/InGamePlayer.entity';
import { GameSummary, Player } from './types';
import { assertIdsInGroup, findOwnedGame } from 'src/common/group-access';
import { RankingsRepository } from 'src/repository/rankings.repository';
import { AbilityRepository } from 'src/repository/ability.repository';
import { computeRankings } from './rankings.util';
import { RankingsResponse } from './rankings.types';

@Injectable()
export class LogService {
  constructor(
    private readonly logRepository: LogRepository,
    private readonly gameRepository: GameRepository,
    private readonly dataSource: DataSource,
    private readonly rankingsRepository: RankingsRepository,
    private readonly abilityRepository: AbilityRepository,
  ) {}

  // 대상 게임이 요청자의 소속 그룹 소유인지 검증하고 게임을 반환한다.
  private async assertGameInGroup(gameId: number, userGroupId: number) {
    return findOwnedGame(this.gameRepository, gameId, userGroupId);
  }

  async getLogByGroupId(groupId: number) {
    return this.logRepository.findByGroupId(groupId);
  }

  async getLogByDaily(dateString: string, groupId: number) {
    const playerMap = new Map<number, Player>();
    const logs = await this.logRepository.findByDaily(dateString, groupId);
    logs?.forEach((log: any) => {
      if (!log.player) {
        return;
      }

      const getPlayerMap = playerMap.get(log.playerId);
      playerMap.set(log.playerId, {
        id: log.playerId,
        name: log.player.name,
        backnumber: Number(log.player.backnumber),
        totalScore: (getPlayerMap?.totalScore || 0) + log.logitem.value,
        logItem: {
          ...getPlayerMap?.logItem,
          [log.logitemId]: {
            ...log.logitem,
            count: (getPlayerMap?.logItem[log.logitemId]?.count || 0) + 1,
            value:
              (getPlayerMap?.logItem[log.logitemId]?.value || 0) +
              log.logitem.value,
          },
        },
      });
    });
    return Array.from(playerMap.values());
  }

  async getDailyDates(groupId: number) {
    return this.logRepository.findDailyDates(groupId);
  }

  async getDailyGames(dateString: string, groupId: number) {
    const logs = await this.logRepository.findDailyLogsWithGame(
      dateString,
      groupId,
    );
    if (!logs || logs.length === 0) {
      return [];
    }

    // 게임별 선수의 홈/어웨이 소속 매핑
    const gameIds = Array.from(new Set(logs.map((log) => log.gameId)));
    const inGamePlayers = await this.dataSource
      .getRepository(InGamePlayer)
      .find({ where: { gameId: In(gameIds), groupId: Number(groupId) } });
    const teamByGamePlayer = new Map<string, string>();
    inGamePlayers.forEach((igp) => {
      teamByGamePlayer.set(`${igp.gameId}:${igp.playerId}`, igp.team);
    });

    const gameMap = new Map<number, GameSummary>();
    logs.forEach((log) => {
      if (!log.game || log.game.status === 'DELETED') {
        return;
      }
      let summary = gameMap.get(log.gameId);
      if (!summary) {
        summary = {
          id: log.gameId,
          homeTeamName: log.game.homeTeamName,
          awayTeamName: log.game.awayTeamName,
          homeScore: 0,
          awayScore: 0,
          status: log.game.status,
        };
        gameMap.set(log.gameId, summary);
      }
      if (!log.player) {
        return; // FK 제거 정책: 삭제된 선수 로그는 스코어 합산에서 제외
      }
      const team = teamByGamePlayer.get(`${log.gameId}:${log.playerId}`);
      if (team === 'home') {
        summary.homeScore += log.logitem.value;
      } else if (team === 'away') {
        summary.awayScore += log.logitem.value;
      }
    });
    return Array.from(gameMap.values());
  }

  async getLogByGameId(gameId: number) {
    return this.logRepository.findLogsByGameId(gameId);
  }

  async getLogByPlayerId(playerId: number, seasonId?: number) {
    return this.logRepository.findByPlayerId(playerId, seasonId);
  }

  async getLogByLogitemId(logitemId: number) {
    return this.logRepository.findByLogitemId(logitemId);
  }

  async getLogByLogItemIdAndGroupId(logitemId: number, groupId: number) {
    return this.logRepository.findByLogItemIdAndGroupId(logitemId, groupId);
  }

  // 랭킹 집계. seasonId가 없으면 전체(시즌 미지정 경기 포함).
  async getRankings(
    groupId: number,
    seasonId?: number,
  ): Promise<RankingsResponse> {
    const [rows, gamesPlayed] = await Promise.all([
      this.rankingsRepository.aggregateRankings(groupId, seasonId),
      this.abilityRepository.aggregateGamesPlayed(groupId, seasonId),
    ]);
    return computeRankings({ rows, gamesPlayed });
  }

  async createLog(log: PostLogRequestDto, userGroupId: number) {
    // DTO의 groupId가 아닌 게임의 실제 소유 그룹으로 검증한다.
    const game = await this.assertGameInGroup(log.gameId, userGroupId);

    // 선수/기록 항목도 요청자 그룹 소속인지 검증한다.
    await assertIdsInGroup(
      this.dataSource.getRepository(PlayerEntity),
      [log.playerId],
      userGroupId,
      '다른 그룹의 선수는 사용할 수 없습니다.',
    );
    await assertIdsInGroup(
      this.dataSource.getRepository(Logitem),
      [log.logitemId],
      userGroupId,
      '다른 그룹의 기록 항목은 사용할 수 없습니다.',
    );

    // 현재 게임의 마지막 시퀀스 번호 조회
    const lastLog = await this.logRepository.findLastLogByGameId(log.gameId);
    const sequence = lastLog ? lastLog.sequence + 1 : 1;

    // 쿼터는 클라이언트가 아닌 서버(게임의 현재 쿼터)가 결정한다.
    const logInstance = plainToInstance(Log, {
      ...log,
      sequence,
      quarter: game.currentQuarter ?? 1,
    });
    return this.logRepository.createLog(logInstance);
  }

  async undoLastLog(gameId: number, userGroupId: number) {
    await this.assertGameInGroup(gameId, userGroupId);

    // 게임의 마지막 로그 조회
    const lastLog = await this.logRepository.findLastLogByGameId(gameId);
    if (!lastLog) {
      throw new Error('되돌릴 로그가 없습니다.');
    }

    // 로그 삭제
    await this.logRepository.removeLog(lastLog.id);
    return lastLog;
  }

  async redoLog(gameId: number, sequence: number, userGroupId: number) {
    await this.assertGameInGroup(gameId, userGroupId);

    // 특정 시퀀스의 로그 복원
    const log = await this.logRepository.findLogByGameIdAndSequence(
      gameId,
      sequence,
    );
    if (!log) {
      throw new HttpException(
        '복원할 로그를 찾을 수 없습니다.',
        HttpStatus.BAD_REQUEST,
      );
    }
    // 새로운 로그 생성 (마지막 시퀀스 + 1)
    const lastLog = await this.logRepository.findLastLogByGameId(gameId);
    const newSequence = lastLog ? lastLog.sequence + 1 : 1;

    const newLog = plainToInstance(Log, {
      ...log,
      sequence: newSequence,
      id: undefined, // 새로운 ID 생성을 위해 undefined 설정
    });

    return this.logRepository.createLog(newLog);
  }
}
