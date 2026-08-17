import { Column, Entity, Index, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { InGamePlayer } from "./InGamePlayer.entity";
import { Log } from "./Log.entity";
@Entity()
// 시즌 필터 조회는 전부 이 두 컬럼으로 걸린다.
@Index(['groupId', 'seasonId'])
export class Game {
  @PrimaryGeneratedColumn()
  id: number;
  @Column('int')
  groupId: number;
  // 경기 생성 시점의 Group.currentSeasonId 스냅샷. FK를 만들지 않는다(시즌 삭제 시 경기 보존).
  // 시즌 도입 이전 경기는 null이며 '전체' 조회에서만 보인다.
  @Column('int', { nullable: true })
  seasonId: number | null;
  @Column('date')
  date: Date;
  @Column('varchar', { length: 20, nullable: true })
  homeTeamName: string;
  @Column('varchar', { length: 20, nullable: true })
  awayTeamName: string;
  @Column({
    type: 'varchar',
    default: 'IN_PROGRESS',
    comment: 'IN_PROGRESS | FINISHED | DELETED',
    enum: ['IN_PROGRESS', 'FINISHED', 'DELETED']
  })
  status: 'IN_PROGRESS' | 'FINISHED' | 'DELETED';
  @Column('int', { default: 1 })
  currentQuarter: number;

  @OneToMany(() => InGamePlayer, (inGamePlayers) => inGamePlayers.game)
  inGamePlayers: InGamePlayer[];
  @OneToMany(() => Log, (log) => log.game)
  logs: Log[];
}

