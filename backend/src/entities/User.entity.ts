import { Column, Entity, OneToMany, OneToOne, PrimaryGeneratedColumn } from "typeorm";
import { Group } from "./Group.entity";
import { Subscription } from "./Subscription.entity";
import { Payment } from "./Payment.entity";
@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;
  @Column('int')
  groupId: number;
  @Column('varchar', { unique: true })
  email: string;
  @Column('varchar')
  password: string;
  @Column('varchar')
  phoneNumber: string;
  @Column('timestamp', { default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
  
  @OneToOne(() => Group, (group) => group.id)
  group: Group;
  @OneToMany(() => Subscription, (subscription) => subscription.user)
  subscriptions: Subscription[];
  @OneToMany(() => Payment, (payment) => payment.user)
  payments: Payment[];
}
