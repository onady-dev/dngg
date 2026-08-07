import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { GroupRepository } from 'src/repository/group.repository';
import { PostGroupRequestDto } from './group.request.dto';
import { plainToInstance } from 'class-transformer';
import { Group } from 'src/entities/Group.entity';
import { Logitem } from 'src/entities/Logitem.entity';
import { assertSameGroup } from 'src/common/group-access';
import { SubscriptionService } from '../subscription/subscription.service';
import { LogitemRepository } from 'src/repository/config.repository';
import {
  DEFAULT_LOGITEMS,
  TEMPLATE_GROUP_ID,
  seedLogitemsForGroup,
} from '../logitem/logitem-seed';

// 시드 직렬화용 Postgres advisory lock 키 (임의 고정값)
const LOGITEM_SEED_LOCK_KEY = 727172;

@Injectable()
export class GroupService implements OnModuleInit {
  private readonly logger = new Logger(GroupService.name);

  constructor(
    private readonly groupRepository: GroupRepository,
    private readonly subscriptionService: SubscriptionService,
    private readonly logitemRepository: LogitemRepository,
  ) {}

  // 템플릿 그룹(0)에 로그 항목이 없으면 기본 항목을 시드한다 (멱등)
  async onModuleInit() {
    try {
      await this.logitemRepository.manager.transaction(async (manager) => {
        // 여러 인스턴스가 동시에 부팅하면 check-then-insert가 레이스되어
        // 중복 시드되므로, advisory lock으로 시드 구간을 직렬화한다
        await manager.query('SELECT pg_advisory_xact_lock($1)', [
          LOGITEM_SEED_LOCK_KEY,
        ]);
        const count = await manager.count(Logitem, {
          where: { groupId: TEMPLATE_GROUP_ID },
        });
        if (count > 0) return;
        const items = DEFAULT_LOGITEMS.map(({ name, value }) =>
          plainToInstance(Logitem, { groupId: TEMPLATE_GROUP_ID, name, value }),
        );
        await manager.save(items);
        this.logger.log(`템플릿 로그 항목 ${items.length}개 시드 완료`);
      });
    } catch (error) {
      // 시드 실패로 부팅을 막지 않는다 — 실패 시 새 그룹에 로그 항목이 복제되지 않으므로 로그로 남긴다
      this.logger.error(
        '템플릿 로그 항목 시드 실패',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async getGroupByName(name: string) {
    return this.groupRepository.findByName(name);
  }

  async createGroup(group: PostGroupRequestDto) {
    const groupInstance = plainToInstance(Group, group);
    const created = await this.groupRepository.createGroup(groupInstance);
    await seedLogitemsForGroup(this.logitemRepository.manager, created.id);
    return created;
  }

  // /group/all은 인증 없이 열려 있다 — 비로그인 사용자도 헤더에서 그룹을 골라
  // 기록을 볼 수 있어야 하므로 공개를 유지한다. 다만 그룹명이 로그인 아이디가 된
  // 뒤로 이 응답은 사실상 아이디 목록이므로, 화면이 쓰는 id/name만 남기고
  // 결제·과금 필드(customerKey, freeGamesUsed)는 내보내지 않는다.
  async getAllGroups(): Promise<{ id: number; name: string }[]> {
    const groups = await this.groupRepository.findAll();
    return groups.map(({ id, name }) => ({ id, name }));
  }

  async deleteGroup(id: number, userGroupId: number) {
    // 본인 소속 그룹만 삭제 가능 (결제 중인 타 그룹 삭제 방지)
    assertSameGroup(userGroupId, id);
    // 자동결제 중단 — 삭제된 그룹에 크론이 계속 청구하지 않도록
    await this.subscriptionService.cancelForGroup(id);
    await this.groupRepository.softDeleteById(id);
    return { id, isDeleted: true };
  }
}
