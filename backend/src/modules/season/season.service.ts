import { Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { DataSource, Repository } from 'typeorm';
import { assertSameGroup } from 'src/common/group-access';
import { Season } from 'src/entities/Season.entity';
import { Group } from 'src/entities/Group.entity';
import { SeasonRepository } from 'src/repository/season.repository';

@Injectable()
export class SeasonService {
  constructor(
    private readonly seasonRepository: SeasonRepository,
    private readonly groupRepository: Repository<Group>,
    private readonly dataSource: DataSource,
  ) {}

  async createSeason(dto: { groupId: number; name: string }): Promise<Season> {
    const seasonInstance = plainToInstance(Season, {
      groupId: Number(dto.groupId),
      name: dto.name,
    });
    return this.seasonRepository.saveSeason(seasonInstance);
  }

  async getSeasons(
    groupId: number,
  ): Promise<{ seasons: Season[]; currentSeasonId: number | null }> {
    const [seasons, group] = await Promise.all([
      this.seasonRepository.findByGroupId(groupId),
      this.groupRepository.findOne({ where: { id: Number(groupId) } }),
    ]);
    return { seasons, currentSeasonId: group?.currentSeasonId ?? null };
  }

  async renameSeason(
    id: number,
    groupId: number,
    name: string,
  ): Promise<Season | null> {
    await this.assertSeasonInGroup(id, groupId);
    await this.seasonRepository.updateName(id, name);
    return this.seasonRepository.findById(id);
  }

  // 대상 시즌이 요청자의 소속 그룹 소유인지 검증하고 반환한다.
  private async assertSeasonInGroup(id: number, groupId: number) {
    const season = await this.seasonRepository.findById(id);
    if (!season) {
      throw new NotFoundException('시즌을 찾을 수 없습니다.');
    }
    assertSameGroup(groupId, season.groupId);
    return season;
  }
}
