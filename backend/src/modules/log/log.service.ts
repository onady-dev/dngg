import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LogRepository } from 'src/repository/log.repository';
import { GameRepository } from 'src/repository/game.repository';
import { PostLogRequestDto } from './log.request.dto';
import { plainToInstance } from 'class-transformer';
import { Log } from 'src/entities/Log.entity';
import { Player as PlayerEntity } from 'src/entities/Player.entity';
import { Logitem } from 'src/entities/Logitem.entity';
import { Player } from './types';
import { assertIdsInGroup, findOwnedGame } from 'src/common/group-access';

@Injectable()
export class LogService {
  constructor(
    private readonly logRepository: LogRepository,
    private readonly gameRepository: GameRepository,
    private readonly dataSource: DataSource,
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

  async getLogByGameId(gameId: number) {
    return this.logRepository.findLogsByGameId(gameId);
  }

  async getLogByPlayerId(playerId: number) {
    return this.logRepository.findByPlayerId(playerId);
  }

  async getLogByLogitemId(logitemId: number) {
    return this.logRepository.findByLogitemId(logitemId);
  }

  async getLogByLogItemIdAndGroupId(logitemId: number, groupId: number) {
    return this.logRepository.findByLogItemIdAndGroupId(logitemId, groupId);
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
