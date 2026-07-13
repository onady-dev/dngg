import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { Game } from "./Game.entity";
import { Player } from "./Player.entity";
@Entity()
export class InGamePlayer {
  @Column('int', {
    primary: true,
  })
  groupId: number;
  @Column('int', {
    primary: true,
  })
  gameId: number;
  @Column('int', {
    primary: true,
  })
  playerId: number;
  @Column('varchar', { length: 10 })
  team: string;
  
  @ManyToOne(() => Game, (game) => game.inGamePlayers)
  game: Game;
  @ManyToOne(() => Player, (player) => player.inGamePlayers, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'playerId', referencedColumnName: 'id' })
  player: Player | null;
}

