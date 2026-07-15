import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { DataSource, In, Repository } from 'typeorm';
import { AppSetting } from 'src/entities/AppSetting.entity';
import { Group } from 'src/entities/Group.entity';
import { Subscription } from 'src/entities/Subscription.entity';
import { Payment } from 'src/entities/Payment.entity';
import { MONETIZATION_STARTED_KEY } from './admin.constants';
import { ACTIVE_STATUSES } from '../subscription/subscription.constants';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(AppSetting)
    private readonly settingRepo: Repository<AppSetting>,
    @InjectRepository(Group)
    private readonly groupRepo: Repository<Group>,
    @InjectRepository(Subscription)
    private readonly subRepo: Repository<Subscription>,
    @InjectRepository(Payment)
    private readonly payRepo: Repository<Payment>,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
  ) {}

  async getMonetization(): Promise<{
    started: boolean;
    startedAt: string | null;
  }> {
    const row = await this.settingRepo.findOne({
      where: { key: MONETIZATION_STARTED_KEY },
    });
    return { started: !!row, startedAt: row?.value ?? null };
  }

  // 유료화 시작 (단방향). backfill과 설정 기록은 한 트랜잭션 —
  // 설정 PK 중복(23505)이 동시/중복 클릭 방지선이다.
  async startMonetization(now: Date): Promise<{ startedAt: string }> {
    const startedAt = now.toISOString();
    try {
      await this.dataSource.transaction(async (manager) => {
        // 각 그룹의 현재 게임 수를 무료 사용량으로 스냅샷.
        // GREATEST로 기존 값을 절대 줄이지 않는다.
        await manager.query(
          'UPDATE "group" g SET "freeGamesUsed" = GREATEST(g."freeGamesUsed", (SELECT COUNT(*)::int FROM "game" WHERE "game"."groupId" = g.id AND "game"."status" != \'DELETED\'))',
        );
        await manager.insert(AppSetting, {
          key: MONETIZATION_STARTED_KEY,
          value: startedAt,
        });
      });
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new ConflictException('이미 유료화가 시작되었습니다.');
      }
      throw error;
    }
    return { startedAt };
  }

  async getGroups(): Promise<
    {
      id: number;
      name: string;
      gameCount: number;
      freeGamesUsed: number;
      subscriptionStatus: string;
    }[]
  > {
    const groups = await this.groupRepo.find({
      where: { isDeleted: false },
      order: { id: 'ASC' },
    });
    const counts: { groupId: number; count: number }[] =
      await this.dataSource.query(
        'SELECT "groupId", COUNT(*)::int AS count FROM "game" WHERE "status" != \'DELETED\' GROUP BY "groupId"',
      );
    const countMap = new Map(
      counts.map((row) => [Number(row.groupId), Number(row.count)]),
    );
    const activeSubs = await this.subRepo.find({
      where: { status: In(ACTIVE_STATUSES) },
      relations: ['group'],
    });
    const statusMap = new Map(
      activeSubs
        .filter((sub) => sub.group)
        .map((sub) => [sub.group.id, sub.status as string]),
    );
    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      gameCount: countMap.get(group.id) ?? 0,
      freeGamesUsed: group.freeGamesUsed,
      subscriptionStatus: statusMap.get(group.id) ?? 'none',
    }));
  }

  async getSubscriptionOverview(): Promise<{
    statusCounts: { status: string; count: number }[];
    recentPayments: {
      id: number;
      groupName: string;
      amount: number;
      status: string;
      orderId: string;
      paidAt: Date | null;
      failReason: string | null;
    }[];
  }> {
    const statusCounts: { status: string; count: number }[] =
      await this.subRepo
        .createQueryBuilder('sub')
        .select('sub.status', 'status')
        .addSelect('COUNT(*)::int', 'count')
        .groupBy('sub.status')
        .getRawMany();
    const payments = await this.payRepo.find({
      order: { id: 'DESC' },
      take: 20,
      relations: ['group'],
    });
    // billingKey는 Subscription에만 있지만, 명시적 필드 매핑으로 이중 방어한다.
    const recentPayments = payments.map((payment) => ({
      id: payment.id,
      groupName: payment.group?.name ?? '(삭제된 그룹)',
      amount: payment.amount,
      status: payment.status,
      orderId: payment.orderId,
      paidAt: payment.paidAt ?? null,
      failReason: payment.failReason ?? null,
    }));
    return { statusCounts, recentPayments };
  }

  // 그룹 전환용 스코프 토큰 — 기존 groupId 신뢰 모델을 그대로 통과시키기 위해
  // 대상 groupId를 담은 JWT를 재발급한다. role=admin 유지(게이팅 우회용).
  async switchGroup(
    admin: { userId: number; email: string },
    groupId: number,
  ): Promise<{ accessToken: string; groupId: number }> {
    const group = await this.groupRepo.findOne({
      where: { id: groupId, isDeleted: false },
    });
    if (!group) {
      throw new NotFoundException('그룹을 찾을 수 없습니다.');
    }
    const payload = {
      userId: admin.userId,
      email: admin.email,
      groupId,
      role: 'admin',
    };
    return { accessToken: this.jwtService.sign(payload), groupId };
  }
}
