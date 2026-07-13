import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { User } from "./User.entity";

@Entity()
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.id)
  user: User;

  @Column('int')
  amount: number;

  @Column('varchar')
  currency: string; // 예: KRW, USD

  @Column('varchar')
  status: string; // 예: success, failed, pending, refunded 등

  @Column('varchar')
  method: string; // 예: card, paypal, toss 등

  @Column('varchar')
  externalPaymentId: string; // 외부 결제 시스템의 결제 고유 ID

  @Column('timestamp')
  paidAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
} 