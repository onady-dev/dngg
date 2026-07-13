import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Game } from 'src/entities/Game.entity';
import { Group } from 'src/entities/Group.entity';
import { Player } from 'src/entities/Player.entity';
import { PlayerService } from './player.service';
import { PlayerController } from './player.controller';
import { PlayerRepository } from 'src/repository/player.repository';
import { InGamePlayersRepository } from 'src/repository/inGamePlayers.repository';
import { InGamePlayer } from 'src/entities/InGamePlayer.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([Game, Player, Group, InGamePlayer]),
  ],
  controllers: [PlayerController],
  providers: [PlayerService, PlayerRepository, InGamePlayersRepository],
})
export class PlayerModule {}
