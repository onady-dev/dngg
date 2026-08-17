import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Game } from 'src/entities/Game.entity';
import { Group } from 'src/entities/Group.entity';
import { Player } from 'src/entities/Player.entity';
import { LogService } from './log.service';
import { LogController } from './log.controller';
import { Logitem } from 'src/entities/Logitem.entity';
import { LogRepository } from 'src/repository/log.repository';
import { GameRepository } from 'src/repository/game.repository';
import { Log } from 'src/entities/Log.entity';
import { RankingsRepository } from 'src/repository/rankings.repository';
import { AbilityRepository } from 'src/repository/ability.repository';
import { InGamePlayer } from 'src/entities/InGamePlayer.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Game, Logitem, Player, Group, Log, InGamePlayer]),
  ],
  controllers: [LogController],
  providers: [
    LogService,
    LogRepository,
    GameRepository,
    RankingsRepository,
    AbilityRepository,
  ],
})
export class LogModule {}
