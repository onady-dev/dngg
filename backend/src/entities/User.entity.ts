import { Column, Entity, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Group } from './Group.entity';
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
}
