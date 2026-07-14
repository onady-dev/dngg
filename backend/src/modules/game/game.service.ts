import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  assertIdsInGroup,
  assertSameGroup,
  findOwnedGame,
} from 'src/common/group-access';
import { Player } from 'src/entities/Player.entity';
import { Logitem } from 'src/entities/Logitem.entity';
import { GameRepository } from 'src/repository/game.repository';
import {
  PostGameAndLogsRequestDto,
  PostGameRequestDto,
} from './game.request.dto';
import { Game } from 'src/entities/Game.entity';
import { DataSource, In } from 'typeorm';
import { InGamePlayer } from 'src/entities/InGamePlayer.entity';
import { InGamePlayersRepository } from 'src/repository/inGamePlayers.repository';
import { Log } from 'src/entities/Log.entity';
import { LogRepository } from 'src/repository/log.repository';
import { Subscription } from 'src/entities/Subscription.entity';
import { Group } from 'src/entities/Group.entity';
import {
  ACTIVE_STATUSES,
  SUBSCRIPTION_REQUIRED_CODE,
} from '../subscription/subscription.constants';
import { getFreeGameLimit } from '../subscription/subscription.config';

@Injectable()
export class GameService {
  constructor(
    private readonly gameRepository: GameRepository,
    private readonly inGamePlayersRepository: InGamePlayersRepository,
    private readonly logRepository: LogRepository,
    private dataSource: DataSource,
  ) {}

  async getGames(
    groupId: number,
    options?: { page?: number; limit?: number; status?: string },
  ) {
    const limit = options?.limit;
    let games = await this.gameRepository.findByGroupId(groupId, options);

    let hasMore = false;
    if (limit && games.length > limit) {
      hasMore = true;
      games = games.slice(0, limit);
    }

    const gameInfo = games.map(async (game: Game) => {
      const homePlayers = await this.inGamePlayersRepository.findPlayers(
        groupId,
        game.id,
        'home',
      );
      const awayPlayers = await this.inGamePlayersRepository.findPlayers(
        groupId,
        game.id,
        'away',
      );
      const logs = await this.logRepository.findLogsByGameId(game.id);
      return {
        id: game.id,
        date: game.date,
        homeTeamName: game.homeTeamName,
        awayTeamName: game.awayTeamName,
        homePlayers: homePlayers?.flatMap((player) =>
          player.player
            ? [
                {
                  id: player.playerId,
                  name: player.player.name,
                  team: player.team,
                },
              ]
            : [],
        ),
        awayPlayers: awayPlayers?.flatMap((player) =>
          player.player
            ? [
                {
                  id: player.playerId,
                  name: player.player.name,
                  team: player.team,
                },
              ]
            : [],
        ),
        logs: logs,
        status: game.status,
      };
    });
    const result = await Promise.all(gameInfo);
    return { games: result, hasMore };
  }

  async updateGameStatus(id: number, status: string, userGroupId: number) {
    await this.assertGameInGroup(id, userGroupId);
    return this.gameRepository.updateGameStatus(id, status);
  }

  // 대상 게임이 요청자의 소속 그룹 소유인지 검증한다.
  private async assertGameInGroup(gameId: number, userGroupId: number) {
    return findOwnedGame(this.gameRepository, gameId, userGroupId);
  }

  async getGameById(id: number) {
    const game = await this.gameRepository.findById(id);
    if (!game) {
      throw new Error('게임을 찾을 수 없습니다.');
    }
    return {
      groupId: game.groupId,
      id: game.id,
      date: game.date,
      homeTeamName: game.homeTeamName,
      awayTeamName: game.awayTeamName,
      homePlayers: game.inGamePlayers
        .filter((player) => player.team === 'home' && player.player)
        .map((player) => player.player),
      awayPlayers: game.inGamePlayers
        .filter((player) => player.team === 'away' && player.player)
        .map((player) => player.player),
      logs: game.logs,
      status: game.status,
    };
  }

  async deleteGame(id: number, userGroupId: number) {
    await this.assertGameInGroup(id, userGroupId);
    return await this.gameRepository.deleteGame(id);
  }

  async saveGameAndLogs(dto: PostGameAndLogsRequestDto, userGroupId: number) {
    // 기존 게임 id로 덮어쓰는 경우, 그 게임이 요청자 그룹 소유인지 확인한다.
    if (dto.id) {
      await this.assertGameInGroup(dto.id, userGroupId);
    }

    // 요청 바디의 선수/기록 항목 id가 모두 요청자 그룹 소속인지 검증한다.
    const requestLogs = dto.logs ?? [];
    const playerIds = [
      ...dto.homePlayers.map((player) => player.id),
      ...dto.awayPlayers.map((player) => player.id),
      ...requestLogs.map((log) => log.playerId),
    ];
    await assertIdsInGroup(
      this.dataSource.getRepository(Player),
      playerIds,
      userGroupId,
      '다른 그룹의 선수는 사용할 수 없습니다.',
    );
    await assertIdsInGroup(
      this.dataSource.getRepository(Logitem),
      requestLogs.map((log) => log.logitemId),
      userGroupId,
      '다른 그룹의 기록 항목은 사용할 수 없습니다.',
    );

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // 게이팅: 신규 생성(!dto.id)에만 적용. 기존 게임 수정은 통과.
      if (!dto.id) {
        // 카운터/저장 groupId 일관성: 게이팅은 신뢰 값(userGroupId)으로
        // 세는데 게임은 dto.groupId로 저장되므로, 둘이 다르면 A 그룹 한도를
        // 소비하고 B 그룹에 게임을 만드는 우회가 가능하다. 신규 생성 시 일치 강제.
        assertSameGroup(userGroupId, dto.groupId);
        const activeSubs = await queryRunner.manager.count(Subscription, {
          where: { group: { id: userGroupId }, status: In(ACTIVE_STATUSES) },
        });
        if (activeSubs === 0) {
          const limit = getFreeGameLimit();
          // 원자적 증가 + 한도 재확인 (동시 요청 레이스 방지)
          const result = await queryRunner.manager
            .createQueryBuilder()
            .update(Group)
            .set({ freeGamesUsed: () => '"freeGamesUsed" + 1' })
            .where('id = :id AND "freeGamesUsed" < :limit', {
              id: userGroupId,
              limit,
            })
            .execute();
          if (!result.affected) {
            throw new HttpException(
              {
                message:
                  '무료 경기 생성 횟수를 모두 사용했습니다. 구독 후 계속 이용하세요.',
                code: SUBSCRIPTION_REQUIRED_CODE,
              },
              HttpStatus.PAYMENT_REQUIRED,
            );
          }
        }
      }

      const {
        id,
        groupId,
        homePlayers,
        awayPlayers,
        homeTeamName,
        awayTeamName,
        logs,
      } = dto;
      const gameInstance = plainToInstance(Game, {
        id,
        groupId,
        date: new Date(),
        homeTeamName,
        awayTeamName,
      });

      // 게임 저장
      const { id: gameId } = await this.gameRepository.saveGame(
        gameInstance,
        queryRunner,
      );

      // 게임이 실제로 저장되었는지 확인
      const savedGame = await queryRunner.manager
        .getRepository(Game)
        .findOne({ where: { id: gameId } });
      if (!savedGame) {
        throw new Error('게임 저장에 실패했습니다.');
      }

      // 이후 작업 진행
      const emptyGameConnectPlayer =
        await this.inGamePlayersRepository.emptyInGamePlayers(
          groupId,
          gameId,
          queryRunner,
        );

      const emptyLog = await this.logRepository.emptyLog(
        groupId,
        gameId,
        queryRunner,
      );

      // 기존 데이터 삭제가 완료된 후에 새 데이터 삽입
      await Promise.all([emptyGameConnectPlayer, emptyLog]);

      // 홈 플레이어 저장
      for (const { id: playerId } of homePlayers) {
        const gcpInstance = plainToInstance(InGamePlayer, {
          groupId,
          gameId,
          playerId,
          team: 'home',
        });
        await this.inGamePlayersRepository.saveInGamePlayers(
          gcpInstance,
          queryRunner,
        );
      }

      // 어웨이 플레이어 저장
      for (const { id: playerId } of awayPlayers) {
        const gcpInstance = plainToInstance(InGamePlayer, {
          groupId,
          gameId,
          playerId,
          team: 'away',
        });
        await this.inGamePlayersRepository.saveInGamePlayers(
          gcpInstance,
          queryRunner,
        );
      }

      // 로그 저장
      for (const { playerId, logitemId } of logs) {
        const logInstance = plainToInstance(Log, {
          groupId,
          gameId,
          playerId,
          logitemId,
        });
        await this.logRepository.saveLog(logInstance, queryRunner);
      }

      await queryRunner.commitTransaction();
      return { gameId };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
