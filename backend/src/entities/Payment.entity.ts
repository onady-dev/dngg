import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Group } from './Group.entity';
import { User } from './User.entity';
import { Subscription } from './Subscription.entity';

@Entity()
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Subscription, { nullable: true })
  subscription: Subscription;

  @ManyToOne(() => Group)
  group: Group;

  @ManyToOne(() => User, { nullable: true })
  user: User;

  @Column('int')
  amount: number;

  // 멱등성 보장 — 토스 결제 요청 orderId
  @Column('varchar', { unique: true })
  orderId: string;

  // 토스 paymentKey (성공 시)
  @Column('varchar', { nullable: true })
  externalPaymentId: string;

  @Column('varchar')
  status: 'success' | 'failed';

  @Column('varchar', { nullable: true })
  failReason: string | null;

  // 이 orderId로 DB에 영속화된 실패 횟수 — 크론 갱신 재시도의 Idempotency-Key 산출에 사용된다.
  @Column({ type: 'int', default: 0 })
  attemptCount: number;

  @Column('timestamp', { nullable: true })
  paidAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
