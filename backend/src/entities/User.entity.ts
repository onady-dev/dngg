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
  // 표시용 이름 — 신규 가입은 필수(DTO에서 강제), 기존 유저는 null이라 nullable
  @Column('varchar', { length: 30, nullable: true })
  name: string | null;
  @Column('timestamp', { default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  // 'user' | 'admin' — 최초 관리자는 DB 수동 지정 (UPDATE "user" SET role='admin' WHERE email='...')
  @Column('varchar', { default: 'user' })
  role: string;

  @OneToOne(() => Group, (group) => group.id)
  group: Group;
}
