import { InjectRepository } from '@nestjs/typeorm';
import { Game } from 'src/entities/Game.entity';
import { QueryRunner, Repository } from 'typeorm';

export class GameRepository extends Repository<Game> {
  constructor(
    @InjectRepository(Game)
    private gameRepository: Repository<Game>,
  ) {
    super(
      gameRepository.target,
      gameRepository.manager,
      gameRepository.queryRunner,
    );
  }

  async findByGroupId(
    groupId: number,
    options?: { page?: number; limit?: number; status?: string },
  ): Promise<Game[]> {
    const query = this.gameRepository
      .createQueryBuilder('game')
      .where('game."groupId" = :groupId', { groupId })
      .andWhere('game."status" != :deletedStatus', {
        deletedStatus: 'DELETED',
      });

    if (options?.status) {
      query.andWhere('game."status" = :status', { status: options.status });
    }

    query.orderBy('game."id"', 'DESC');

    if (options?.page !== undefined && options?.limit !== undefined) {
      query.skip((options.page - 1) * options.limit).take(options.limit + 1);
    }

    return query.getMany();
  }

  async findById(id: number): Promise<Game | null> {
    return this.gameRepository.findOne({
      where: {
        id,
      },
      relations: ['inGamePlayers', 'logs', 'inGamePlayers.player'],
    });
  }

  async saveGame(game: Game, queryRunner: QueryRunner): Promise<Game> {
    return queryRunner.manager.save(Game, game);
  }

  async deleteGame(id: number) {
    return this.gameRepository.update(id, { status: 'DELETED' });
  }

  async updateGameStatus(id: number, status: string) {
    return this.gameRepository.update(id, {
      status: status as 'IN_PROGRESS' | 'FINISHED',
    });
  }

  async updateGameQuarter(id: number, quarter: number) {
    return this.gameRepository.update(id, { currentQuarter: quarter });
  }
}
