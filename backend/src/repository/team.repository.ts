import { InjectRepository } from '@nestjs/typeorm';
import { Team } from 'src/entities/Team.entity';
import { QueryRunner, Repository } from 'typeorm';

export class TeamRepository extends Repository<Team> {
  constructor(
    @InjectRepository(Team)
    private teamRepository: Repository<Team>,
  ) {
    super(
      teamRepository.target,
      teamRepository.manager,
      teamRepository.queryRunner,
    );
  }

  async findByGroupId(groupId: number): Promise<Team[]> {
    return this.teamRepository.find({
      where: {
        groupId: groupId,
      },
      relations: ['teamPlayers', 'teamPlayers.player'],
      order: {
        id: 'ASC',
      },
    });
  }

  async findById(id: number): Promise<Team | null> {
    return this.teamRepository.findOne({
      where: {
        id: id,
      },
    });
  }

  async saveTeam(team: Team, queryRunner?: QueryRunner): Promise<Team> {
    if (queryRunner) {
      return queryRunner.manager.save(Team, team);
    }
    return this.teamRepository.save(team);
  }

  async updateTeamName(id: number, name: string, queryRunner?: QueryRunner) {
    if (queryRunner) {
      return queryRunner.manager.update(Team, id, { name });
    }
    return this.teamRepository.update(id, { name });
  }

  async deleteTeam(id: number, queryRunner?: QueryRunner) {
    if (queryRunner) {
      return queryRunner.manager.delete(Team, id);
    }
    return this.teamRepository.delete(id);
  }

  async deleteByGroupId(groupId: number, queryRunner: QueryRunner) {
    return queryRunner.manager.delete(Team, { groupId });
  }
}
