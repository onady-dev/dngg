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
    options?: {
      page?: number;
      limit?: number;
      status?: string;
      from?: string;
      to?: string;
    },
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

    // 날짜 범위는 양끝을 포함한다.
    if (options?.from) {
      query.andWhere('game."date" >= :from', { from: options.from });
    }
    if (options?.to) {
      query.andWhere('game."date" <= :to', { to: options.to });
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

  // 여러 경기의 시즌을 한 번에 바꾼다. seasonId가 null이면 시즌 미지정으로 되돌린다.
  // groupId를 WHERE에 다시 거는 것은 방어적 중복이다(서비스가 이미 소유권을 검증한다).
  // 삭제된 경기는 대상에서 제외한다.
  async updateSeason(
    groupId: number,
    gameIds: number[],
    seasonId: number | null,
  ): Promise<number> {
    if (gameIds.length === 0) return 0;
    const result = await this.gameRepository
      .createQueryBuilder()
      .update(Game)
      .set({ seasonId })
      .where('id IN (:...gameIds)', { gameIds })
      .andWhere('"groupId" = :groupId', { groupId: Number(groupId) })
      .andWhere("status <> 'DELETED'")
      .execute();
    return result.affected ?? 0;
  }
}
