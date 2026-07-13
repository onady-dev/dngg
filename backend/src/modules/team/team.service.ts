import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { DataSource } from 'typeorm';
import { Team } from 'src/entities/Team.entity';
import { TeamPlayer } from 'src/entities/TeamPlayer.entity';
import { TeamRepository } from 'src/repository/team.repository';
import { TeamPlayerRepository } from 'src/repository/teamPlayer.repository';
import { PlayerRepository } from 'src/repository/player.repository';
import {
  BulkTeamsRequestDto,
  PostTeamRequestDto,
  PutTeamRequestDto,
} from './team.request.dto';

@Injectable()
export class TeamService {
  constructor(
    private readonly teamRepository: TeamRepository,
    private readonly teamPlayerRepository: TeamPlayerRepository,
    private readonly playerRepository: PlayerRepository,
    private readonly dataSource: DataSource,
  ) {}

  async getTeamsByGroupId(groupId: number) {
    const teams = await this.teamRepository.findByGroupId(groupId);
    // 삭제된 선수(player가 null)는 응답에서 제외 (game.service의 null-safe 정책과 동일)
    return teams.map((team) => ({
      id: team.id,
      groupId: team.groupId,
      name: team.name,
      players: (team.teamPlayers ?? [])
        .filter((teamPlayer) => teamPlayer.player)
        .map((teamPlayer) => teamPlayer.player),
    }));
  }

  async createTeam(dto: PostTeamRequestDto) {
    const { groupId, name, playerIds } = dto;
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const teamInstance = plainToInstance(Team, { groupId, name });
      const savedTeam = await this.teamRepository.saveTeam(
        teamInstance,
        queryRunner,
      );

      if (playerIds && playerIds.length > 0) {
        await this.replaceTeamPlayers(
          savedTeam.id,
          groupId,
          playerIds,
          queryRunner,
        );
      }

      await queryRunner.commitTransaction();
      return this.findTeamResponse(savedTeam.id, groupId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async updateTeam(id: number, dto: PutTeamRequestDto) {
    const { groupId, name, playerIds } = dto;
    const team = await this.teamRepository.findById(id);
    if (!team || team.groupId !== groupId) {
      throw new NotFoundException('Team not found');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      if (name !== undefined) {
        await this.teamRepository.updateTeamName(id, name, queryRunner);
      }
      if (playerIds !== undefined) {
        await this.replaceTeamPlayers(id, groupId, playerIds, queryRunner);
      }
      await queryRunner.commitTransaction();
      return this.findTeamResponse(id, groupId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async deleteTeam(id: number, groupId: number) {
    const team = await this.teamRepository.findById(id);
    if (!team || team.groupId !== groupId) {
      throw new NotFoundException('Team not found');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await this.teamPlayerRepository.deleteByTeamId(id, queryRunner);
      await this.teamRepository.deleteTeam(id, queryRunner);
      await queryRunner.commitTransaction();
      return { deleted: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async deleteAllTeams(groupId: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await this.teamPlayerRepository.deleteByGroupId(groupId, queryRunner);
      await this.teamRepository.deleteByGroupId(groupId, queryRunner);
      await queryRunner.commitTransaction();
      return { deleted: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async bulkCreateTeams(dto: BulkTeamsRequestDto) {
    const { groupId, teams } = dto;

    // 이중 업로드 방지: 이미 팀이 있는 그룹은 거부
    const existingTeams = await this.teamRepository.findByGroupId(groupId);
    if (existingTeams.length > 0) {
      throw new BadRequestException('Teams already exist for this group');
    }

    // 존재하지 않는(삭제된) 선수 id는 걸러낸다
    const groupPlayers = await this.playerRepository.findByGroupId(groupId);
    const validPlayerIds = new Set((groupPlayers ?? []).map((p) => p.id));

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      for (const teamItem of teams) {
        const teamInstance = plainToInstance(Team, {
          groupId,
          name: teamItem.name,
        });
        const savedTeam = await this.teamRepository.saveTeam(
          teamInstance,
          queryRunner,
        );

        const playerIds = teamItem.playerIds.filter((playerId) =>
          validPlayerIds.has(playerId),
        );
        for (const playerId of playerIds) {
          const teamPlayerInstance = plainToInstance(TeamPlayer, {
            teamId: savedTeam.id,
            playerId,
            groupId,
          });
          await this.teamPlayerRepository.saveTeamPlayer(
            teamPlayerInstance,
            queryRunner,
          );
        }
      }
      await queryRunner.commitTransaction();
      return this.getTeamsByGroupId(groupId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // 팀 선수 전체 교체. 같은 그룹의 다른 팀에 있던 선수는 그 팀에서 빼서 가져온다(steal).
  // 두 기기가 동시에 같은 선수를 다른 팀에 배정해도 unique 위반 대신 최종 상태로 수렴시키기 위함.
  private async replaceTeamPlayers(
    teamId: number,
    groupId: number,
    playerIds: number[],
    queryRunner,
  ) {
    await this.teamPlayerRepository.deleteByGroupIdAndPlayerIds(
      groupId,
      playerIds,
      queryRunner,
    );
    await this.teamPlayerRepository.deleteByTeamId(teamId, queryRunner);
    for (const playerId of playerIds) {
      const teamPlayerInstance = plainToInstance(TeamPlayer, {
        teamId,
        playerId,
        groupId,
      });
      await this.teamPlayerRepository.saveTeamPlayer(
        teamPlayerInstance,
        queryRunner,
      );
    }
  }

  private async findTeamResponse(teamId: number, groupId: number) {
    const teams = await this.getTeamsByGroupId(groupId);
    return teams.find((team) => team.id === teamId);
  }
}
