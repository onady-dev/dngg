import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { Team } from './Team.entity';
import { Player } from './Player.entity';

// 그룹 단위로 재사용하는 팀 구성의 팀-선수 매핑.
// FK를 생성하지 않는 이유: 선수 삭제 시 과거 데이터 보존 정책(InGamePlayer와 동일 패턴).
@Entity()
@Unique(['groupId', 'playerId'])
export class TeamPlayer {
  @Column('int', {
    primary: true,
  })
  teamId: number;
  @Column('int', {
    primary: true,
  })
  playerId: number;
  @Column('int')
  groupId: number;

  @ManyToOne(() => Team, (team) => team.teamPlayers, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'teamId', referencedColumnName: 'id' })
  team: Team;

  @ManyToOne(() => Player, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'playerId', referencedColumnName: 'id' })
  player: Player | null;
}
