import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { InGamePlayer } from "./InGamePlayer.entity";
import { Log } from "./Log.entity";
@Entity()
export class Game {
  @PrimaryGeneratedColumn()
  id: number;
  @Column('int')
  groupId: number;
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

  @OneToMany(() => InGamePlayer, (inGamePlayers) => inGamePlayers.game)
  inGamePlayers: InGamePlayer[];
  @OneToMany(() => Log, (log) => log.game)
  logs: Log[];
}

