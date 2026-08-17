import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { assertSameGroup } from 'src/common/group-access';
import { PostPlayerRequestDto } from './player.request.dto';
import { PlayerRepository } from 'src/repository/player.repository';
import { Player } from 'src/entities/Player.entity';
import { QueryFailedError } from 'typeorm';
import { InGamePlayersRepository } from 'src/repository/inGamePlayers.repository';
import { AbilityRepository } from 'src/repository/ability.repository';
import { computeAbility } from './ability.util';
import { PlayerAbility } from './ability.types';
import { TeamImpactRepository } from 'src/repository/team-impact.repository';
import { computeTeamImpact } from './team-impact.util';
import { PlayerTeamImpact } from './team-impact.types';

@Injectable()
export class PlayerService {
  constructor(
    private readonly playerRepository: PlayerRepository,
    private readonly inGamePlayersRepository: InGamePlayersRepository,
    private readonly abilityRepository: AbilityRepository,
    private readonly teamImpactRepository: TeamImpactRepository,
  ) {}

  async getPlayerByGroupId(groupId: number) {
    return this.playerRepository.findByGroupId(groupId);
  }

  async getPlayerByPlayerId(id: number) {
    return this.playerRepository.findById(id);
  }

  async createPlayer(dto: PostPlayerRequestDto) {
    const playerInstance = plainToInstance(Player, { ...dto });
    return await this.playerRepository.savePlayer(playerInstance);
  }

  async updatePlayer(
    id: number,
    dto: PostPlayerRequestDto,
    userGroupId: number,
  ) {
    await this.assertPlayerInGroup(id, userGroupId);
    const playerInstance = plainToInstance(Player, { ...dto });
    await this.playerRepository.updatePlayer(id, playerInstance);
    return await this.playerRepository.findById(id);
  }

  async deletePlayer(id: number, userGroupId: number) {
    await this.assertPlayerInGroup(id, userGroupId);
    return await this.playerRepository.deletePlayer(id);
  }

  // 대상 선수가 요청자의 소속 그룹 소유인지 검증한다.
  private async assertPlayerInGroup(playerId: number, userGroupId: number) {
    const player = await this.playerRepository.findById(playerId);
    if (!player) {
      throw new NotFoundException('선수를 찾을 수 없습니다.');
    }
    assertSameGroup(userGroupId, player.groupId);
  }

  async getTotalGamesPlayed(id: number) {
    const test = await this.inGamePlayersRepository.getTotalGamesPlayed(id);
    return test;
  }

  async getPlayerAbility(
    id: number,
    seasonId?: number,
  ): Promise<PlayerAbility> {
    const player = await this.playerRepository.findById(id);
    if (!player) {
      throw new NotFoundException('선수를 찾을 수 없습니다.');
    }
    const groupId = player.groupId;
    const [rows, gamesPlayed] = await Promise.all([
      this.abilityRepository.aggregateGroupAbility(groupId, seasonId),
      this.abilityRepository.aggregateGamesPlayed(groupId, seasonId),
    ]);
    return computeAbility({ rows, gamesPlayed, targetPlayerId: id, groupId });
  }

  async getPlayerTeamImpact(
    id: number,
    seasonId?: number,
  ): Promise<PlayerTeamImpact> {
    const player = await this.playerRepository.findById(id);
    if (!player) {
      throw new NotFoundException('선수를 찾을 수 없습니다.');
    }
    const groupId = player.groupId;
    const games = await this.teamImpactRepository.findFinishedGames(
      id,
      seasonId,
    );
    const gameIds = games.map((g) => g.gameId);
    const [teamAgg, selfAgg, roster] = await Promise.all([
      this.teamImpactRepository.aggregateTeamByItem(gameIds),
      this.teamImpactRepository.aggregateSelfByItem(id, gameIds),
      this.teamImpactRepository.findTeammates(id, gameIds),
    ]);
    return computeTeamImpact({
      games,
      teamAgg,
      selfAgg,
      roster,
      targetPlayerId: id,
      groupId,
    });
  }
}
