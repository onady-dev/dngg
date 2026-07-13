import { InjectRepository } from '@nestjs/typeorm';
import { TeamPlayer } from 'src/entities/TeamPlayer.entity';
import { In, QueryRunner, Repository } from 'typeorm';

export class TeamPlayerRepository extends Repository<TeamPlayer> {
  constructor(
    @InjectRepository(TeamPlayer)
    private teamPlayerRepository: Repository<TeamPlayer>,
  ) {
    super(
      teamPlayerRepository.target,
      teamPlayerRepository.manager,
      teamPlayerRepository.queryRunner,
    );
  }

  async deleteByTeamId(teamId: number, queryRunner: QueryRunner) {
    return queryRunner.manager.delete(TeamPlayer, { teamId });
  }

  async deleteByGroupIdAndPlayerIds(
    groupId: number,
    playerIds: number[],
    queryRunner: QueryRunner,
  ) {
    if (playerIds.length === 0) return;
    return queryRunner.manager.delete(TeamPlayer, {
      groupId,
      playerId: In(playerIds),
    });
  }

  async deleteByGroupId(groupId: number, queryRunner: QueryRunner) {
    return queryRunner.manager.delete(TeamPlayer, { groupId });
  }

  async saveTeamPlayer(
    teamPlayer: TeamPlayer,
    queryRunner: QueryRunner,
  ): Promise<TeamPlayer> {
    return queryRunner.manager.save(TeamPlayer, teamPlayer);
  }
}
