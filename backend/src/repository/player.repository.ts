import { InjectRepository } from '@nestjs/typeorm';
import { Player } from 'src/entities/Player.entity';
import { Repository } from 'typeorm';

export class PlayerRepository extends Repository<Player> {
  constructor(
    @InjectRepository(Player)
    private playerRepository: Repository<Player>,
  ) {
    super(
      playerRepository.target,
      playerRepository.manager,
      playerRepository.queryRunner,
    );
  }

  async findByGroupId(groupId: number): Promise<Player[] | null> {
    return this.playerRepository.find({
      where: {
        groupId: groupId,
      },
    });
  }

  async findById(id: number): Promise<Player | null> {
    return this.playerRepository.findOne({
      where: {
        id: id,
      },
    });
  }
  async savePlayer(player: Player): Promise<Player> {
    return this.playerRepository.save(player);
  }

  async updatePlayer(id: number, player: Player) {
    return this.playerRepository.update(id, player);
  }

  async deletePlayer(id: number) {
    return this.playerRepository.delete(id);
  }
}
