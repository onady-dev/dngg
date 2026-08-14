import { InjectRepository } from '@nestjs/typeorm';
import { Season } from 'src/entities/Season.entity';
import { Repository } from 'typeorm';

export class SeasonRepository extends Repository<Season> {
  constructor(
    @InjectRepository(Season)
    private seasonRepository: Repository<Season>,
  ) {
    super(
      seasonRepository.target,
      seasonRepository.manager,
      seasonRepository.queryRunner,
    );
  }

  async findByGroupId(groupId: number): Promise<Season[]> {
    return this.seasonRepository.find({
      where: { groupId: Number(groupId) },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: number): Promise<Season | null> {
    return this.seasonRepository.findOne({ where: { id: Number(id) } });
  }

  async saveSeason(season: Season): Promise<Season> {
    return this.seasonRepository.save(season);
  }

  async updateName(id: number, name: string): Promise<void> {
    await this.seasonRepository.update(id, { name });
  }
}
