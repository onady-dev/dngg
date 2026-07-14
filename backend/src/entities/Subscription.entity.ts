import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Group } from './Group.entity';
import {
  BillingCycle,
  SubscriptionStatus,
} from '../modules/subscription/subscription.constants';

@Entity()
// 그룹당 유효 구독(active/past_due)은 최대 1개 — DB 레벨 불변식.
// count() 선체크는 결제 전 fast-path 가드이고, 이 부분 유니크 인덱스는
// 동시 요청이 그 체크를 통과하는 레이스에 대한 최종 백스톱이다.
// (Postgres 부분 인덱스 — synchronize: true가 생성)
@Index('uq_active_subscription_per_group', ['group'], {
  unique: true,
  where: `status IN ('active', 'past_due')`,
})
export class Subscription {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Group)
  group: Group;

  @Column('varchar')
  billingCycle: BillingCycle;

  @Column('varchar')
  status: SubscriptionStatus;

  @Column('timestamp')
  currentPeriodStart: Date;

  @Column('timestamp')
  currentPeriodEnd: Date;

  @Column('boolean', { default: false })
  cancelAtPeriodEnd: boolean;

  // 토스 발급값 — 어떤 API 응답에도 포함 금지
  @Column('varchar', { nullable: true })
  billingKey: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
