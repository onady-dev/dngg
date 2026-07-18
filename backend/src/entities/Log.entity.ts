import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Game } from './Game.entity';
import { Logitem } from './Logitem.entity';
import { Player } from './Player.entity';
@Entity()
export class Log {
  @PrimaryGeneratedColumn()
  id: number;
  @Column('int')
  groupId: number;
  @Column('int')
  gameId: number;
  @Column('int')
  playerId: number;
  @Column('int')
  logitemId: number;
  @Column('int', { nullable: true })
  sequence: number;
  @Column('int', { nullable: true })
  quarter: number | null;
  @Column('timestamp', { default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @ManyToOne(() => Game, (game) => game.logs)
  game: Game;
  @ManyToOne(() => Logitem, (logitem) => logitem.logs)
  logitem: Logitem;
  @ManyToOne(() => Player, (player) => player.logs, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'playerId', referencedColumnName: 'id' })
  player: Player | null;
}
