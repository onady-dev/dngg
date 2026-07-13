import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TeamPlayer } from './TeamPlayer.entity';
@Entity()
@Unique(['groupId', 'name'])
export class Team {
  @PrimaryGeneratedColumn()
  id: number;
  @Column('int')
  groupId: number;
  @Column('varchar', { length: 30 })
  name: string;

  @OneToMany(() => TeamPlayer, (teamPlayers) => teamPlayers.team)
  teamPlayers: TeamPlayer[];
}
