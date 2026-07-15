import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { DataSource, Repository } from 'typeorm';
import { AppSetting } from 'src/entities/AppSetting.entity';
import { Group } from 'src/entities/Group.entity';
import { Subscription } from 'src/entities/Subscription.entity';
import { Payment } from 'src/entities/Payment.entity';
import { MONETIZATION_STARTED_KEY } from './admin.constants';

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
          'UPDATE "group" g SET "freeGamesUsed" = GREATEST(g."freeGamesUsed", (SELECT COUNT(*)::int FROM "game" WHERE "game"."groupId" = g.id))',
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
}
