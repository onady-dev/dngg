import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

// 그룹이 직접 만드는 시즌. 경기 귀속은 생성 시점의 Group.currentSeasonId 스냅샷으로만
// 결정되므로 시작/종료일 컬럼은 두지 않는다.
@Entity()
@Unique(['groupId', 'name'])
export class Season {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  groupId: number;

  @Column('varchar', { length: 30 })
  name: string;

  @Column('timestamp', { default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
