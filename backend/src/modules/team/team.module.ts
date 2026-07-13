import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Team } from 'src/entities/Team.entity';
import { TeamPlayer } from 'src/entities/TeamPlayer.entity';
import { Player } from 'src/entities/Player.entity';
import { TeamService } from './team.service';
import { TeamController } from './team.controller';
import { TeamRepository } from 'src/repository/team.repository';
import { TeamPlayerRepository } from 'src/repository/teamPlayer.repository';
import { PlayerRepository } from 'src/repository/player.repository';
@Module({
  imports: [TypeOrmModule.forFeature([Team, TeamPlayer, Player])],
  controllers: [TeamController],
  providers: [
    TeamService,
    TeamRepository,
    TeamPlayerRepository,
    PlayerRepository,
  ],
})
export class TeamModule {}
