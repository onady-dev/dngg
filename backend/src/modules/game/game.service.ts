import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  assertIdsInGroup,
  assertSameGroup,
  findOwnedGame,
} from 'src/common/group-access';
import { Player } from 'src/entities/Player.entity';
import { Logitem } from 'src/entities/Logitem.entity';
import { Season } from 'src/entities/Season.entity';
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
import { AppSetting } from '../../entities/AppSetting.entity';
import { MONETIZATION_STARTED_KEY } from '../admin/admin.constants';

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
    options?: {
      page?: number;
      limit?: number;
      status?: string;
      from?: string;
      to?: string;
    },
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
        // 목록에서 어느 경기가 어느 시즌인지 보여주려면 필요하다.
        seasonId: game.seasonId ?? null,
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

  async updateGameQuarter(id: number, quarter: number, userGroupId: number) {
    const game = await this.assertGameInGroup(id, userGroupId);
    // 진행 중인 게임만 쿼터 전환을 허용한다 (FINISHED/DELETED 거부).
    if (game.status !== 'IN_PROGRESS') {
      throw new HttpException(
        '진행 중인 게임만 쿼터를 변경할 수 있습니다.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.gameRepository.updateGameQuarter(id, quarter);
    return this.gameRepository.findOne({ where: { id } });
  }

  // 대상 게임이 요청자의 소속 그룹 소유인지 검증한다.
  private async assertGameInGroup(gameId: number, userGroupId: number) {
    return findOwnedGame(this.gameRepository, gameId, userGroupId);
  }

  // 경기의 시즌을 결정한다.
  // 신규 경기(existingSeasonId === undefined)는 그룹의 현재 시즌을 스냅샷으로 복사하고,
  // 기존 경기를 덮어쓰는 경우에는 원래 seasonId를 그대로 유지한다.
  // seasonId를 DTO에서 받지 않는 이유: 클라이언트가 임의 시즌에 경기를 꽂을 수 있다.
  private async resolveSeasonId(
    manager: { findOne(entity: any, options: any): Promise<any> },
    groupId: number,
    existingSeasonId: number | null | undefined,
  ): Promise<number | null> {
    if (existingSeasonId !== undefined) {
      return existingSeasonId;
    }
    const group = (await manager.findOne(Group, {
      where: { id: Number(groupId) },
    })) as Group | null;
    return group?.currentSeasonId ?? null;
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
      currentQuarter: game.currentQuarter,
      status: game.status,
    };
  }

  async deleteGame(id: number, userGroupId: number) {
    await this.assertGameInGroup(id, userGroupId);
    return await this.gameRepository.deleteGame(id);
  }

  // 선택한 경기들의 시즌을 바꾼다. seasonId가 null이면 시즌 미지정으로 되돌린다.
  // 경기나 시즌이 하나라도 다른 그룹 소유면 전부 거부한다 — 부분 성공을 만들지 않는다.
  async assignSeason(dto: {
    groupId: number;
    gameIds: number[];
    seasonId: number | null;
  }): Promise<{ updated: number }> {
    await assertIdsInGroup(
      this.gameRepository,
      dto.gameIds,
      dto.groupId,
      '다른 그룹의 경기는 배정할 수 없습니다.',
    );

    // null은 "시즌 미지정으로 되돌리기"이므로 시즌 조회 자체가 필요 없다.
    if (dto.seasonId !== null && dto.seasonId !== undefined) {
      await assertIdsInGroup(
        this.dataSource.getRepository(Season),
        [dto.seasonId],
        dto.groupId,
        '다른 그룹의 시즌은 사용할 수 없습니다.',
      );
    }

    const updated = await this.gameRepository.updateSeason(
      dto.groupId,
      dto.gameIds,
      dto.seasonId ?? null,
    );
    return { updated };
  }

  async saveGameAndLogs(
    dto: PostGameAndLogsRequestDto,
    userGroupId: number,
    userRole?: string,
  ) {
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
        // 유료화 시작 전에는 게이팅·카운터 완전 비활성 (무제한 무료 생성).
        // 관리자는 시작 후에도 우회 (운영 지원 입력, 카운터 미증가).
        const monetizationStarted = await queryRunner.manager.findOne(
          AppSetting,
          { where: { key: MONETIZATION_STARTED_KEY } },
        );
        if (monetizationStarted && userRole !== 'admin') {
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

      // 기존 경기를 덮어쓰는 경우 원래 시즌을 유지한다.
      const existingGame = id
        ? await queryRunner.manager.findOne(Game, { where: { id: Number(id) } })
        : null;
      const seasonId = await this.resolveSeasonId(
        queryRunner.manager,
        groupId,
        existingGame ? (existingGame.seasonId ?? null) : undefined,
      );

      const gameInstance = plainToInstance(Game, {
        id,
        groupId,
        seasonId,
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
