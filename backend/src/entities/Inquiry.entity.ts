import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './User.entity';
import {
  InquiryStatus,
  InquiryType,
} from '../modules/inquiry/inquiry.constants';

@Entity()
export class Inquiry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { nullable: true })
  userId: number | null;

  // FK를 걸지 않는다 — UserService.deleteUser가 하드 삭제라 FK가 있으면
  // 문의를 남긴 사용자의 탈퇴가 제약 위반으로 실패한다.
  // Log.player·InGamePlayer.player와 같은 관행. 탈퇴 후에도 문의 이력은 보존된다.
  @ManyToOne(() => User, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'userId', referencedColumnName: 'id' })
  user: User | null;

  // 작성 시점 스냅샷 — 회신 메일은 user.email이 아니라 이 값으로 보낸다.
  // 탈퇴해서 user가 null이 된 문의에도 답장할 수 있다.
  @Column('varchar')
  authorEmail: string;

  @Column('varchar')
  type: InquiryType;

  @Column('text')
  content: string;

  @Column('varchar', { default: 'pending' })
  status: InquiryStatus;

  @Column('text', { nullable: true })
  answer: string | null;

  @Column('timestamp', { nullable: true })
  answeredAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
