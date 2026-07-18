import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { GroupRepository } from 'src/repository/group.repository';
import { PostGroupRequestDto } from './group.request.dto';
import { plainToInstance } from 'class-transformer';
import { Group } from 'src/entities/Group.entity';
import { Logitem } from 'src/entities/Logitem.entity';
import { assertSameGroup } from 'src/common/group-access';
import { SubscriptionService } from '../subscription/subscription.service';
import { LogitemRepository } from 'src/repository/config.repository';

// 새 그룹 생성 시 로그 항목(득점/파울 등)을 복제해올 템플릿 그룹.
// 실제 그룹이 아닌 예약 id로, 부팅 시 아래 기본 항목이 시드된다.
const TEMPLATE_GROUP_ID = 0;

// 시드 직렬화용 Postgres advisory lock 키 (임의 고정값)
const LOGITEM_SEED_LOCK_KEY = 727172;

const DEFAULT_LOGITEMS: Pick<Logitem, 'name' | 'value'>[] = [
  { name: '어시', value: 0 },
  { name: '리바', value: 0 },
  { name: '스틸', value: 0 },
  { name: '블록', value: 0 },
  { name: '턴오버', value: 0 },
  { name: '파울', value: 0 },
  { name: '3점', value: 3 },
  { name: '2점', value: 2 },
  { name: '자유투1점', value: 1 },
  { name: '자유투2점', value: 2 },
];

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
    await this.copyTemplateLogitems(created.id);
    return created;
  }

  // 템플릿 그룹의 로그 항목들을 새 그룹 소속으로 복제한다
  private async copyTemplateLogitems(groupId: number) {
    const templates =
      await this.logitemRepository.findByGroupId(TEMPLATE_GROUP_ID);
    if (!templates?.length) return;
    const copies = templates.map(({ name, value }) =>
      plainToInstance(Logitem, { groupId, name, value }),
    );
    await this.logitemRepository.save(copies);
  }

  async getAllGroups() {
    return this.groupRepository.findAll();
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
