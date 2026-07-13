import { InjectRepository } from '@nestjs/typeorm';
import { InGamePlayer } from 'src/entities/InGamePlayer.entity';
import { QueryRunner, Repository } from 'typeorm';

export class InGamePlayersRepository extends Repository<InGamePlayer> {
  constructor(
    @InjectRepository(InGamePlayer)
    private inGamePlayersRepository: Repository<InGamePlayer>,
  ) {
    super(
      inGamePlayersRepository.target,
      inGamePlayersRepository.manager,
      inGamePlayersRepository.queryRunner,
    );
  }

  async findPlayers(
    groupId: number,
    gameId: number,
    team: string,
  ): Promise<InGamePlayer[] | null> {
    return this.inGamePlayersRepository.find({
      where: {
        groupId,
        gameId,
        team,
      },
      relations: ['player'],
    });
  }

  async emptyInGamePlayers(
    groupId: number,
    gameId: number,
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.manager.delete(InGamePlayer, { groupId, gameId });
  }

  async saveInGamePlayers(
    inGamePlayers: InGamePlayer,
    queryRunner: QueryRunner,
  ): Promise<InGamePlayer> {
    return queryRunner.manager.save(InGamePlayer, inGamePlayers);
  }

  async getTotalGamesPlayed(id: number) {
    return this.inGamePlayersRepository.count({
      where: {
        playerId: id,
      },
    });
  }
}
