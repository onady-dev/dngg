import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { DataSource, Repository } from 'typeorm';
import { assertSameGroup } from 'src/common/group-access';
import { Game } from 'src/entities/Game.entity';
import { Season } from 'src/entities/Season.entity';
import { Group } from 'src/entities/Group.entity';
import { SeasonRepository } from 'src/repository/season.repository';

@Injectable()
export class SeasonService {
  constructor(
    private readonly seasonRepository: SeasonRepository,
    @InjectRepository(Group)
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

  // 시즌을 지우되 경기 기록은 보존한다.
  // 순서: 경기 seasonId 복원 → 현재 시즌 정리 → 시즌 삭제 (한 트랜잭션)
  async deleteSeason(
    id: number,
    groupId: number,
  ): Promise<{ affectedGames: number }> {
    await this.assertSeasonInGroup(id, groupId);
    const group = await this.groupRepository.findOne({
      where: { id: Number(groupId) },
    });
    const wasCurrent = group?.currentSeasonId === Number(id);

    return this.dataSource.transaction(async (manager) => {
      const restored = await manager.update(
        Game,
        { seasonId: Number(id) },
        { seasonId: null },
      );
      if (wasCurrent) {
        await manager.update(
          Group,
          { id: Number(groupId) },
          { currentSeasonId: null },
        );
      }
      await manager.delete(Season, { id: Number(id) });
      return { affectedGames: restored.affected ?? 0 };
    });
  }

  // seasonId가 null이면 현재 시즌을 해제한다.
  async setCurrentSeason(
    groupId: number,
    seasonId: number | null,
  ): Promise<{ currentSeasonId: number | null }> {
    if (seasonId === null || seasonId === undefined) {
      await this.groupRepository.update(Number(groupId), {
        currentSeasonId: null,
      });
      return { currentSeasonId: null };
    }
    // 다른 그룹의 시즌을 자기 현재 시즌으로 지정하는 것을 막는다.
    await this.assertSeasonInGroup(seasonId, groupId);
    await this.groupRepository.update(Number(groupId), {
      currentSeasonId: Number(seasonId),
    });
    return { currentSeasonId: Number(seasonId) };
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
