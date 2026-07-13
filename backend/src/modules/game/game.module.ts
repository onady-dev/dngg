import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Game } from "src/entities/Game.entity";
import { Group } from "src/entities/Group.entity";
import { Player } from "src/entities/Player.entity";
import { GameRepository } from "src/repository/game.repository";
import { GameService } from "./game.service";
import { GameController } from "./game.controller";
import { Logitem } from "src/entities/Logitem.entity";
import { Log } from "src/entities/Log.entity";
import { InGamePlayer } from "src/entities/InGamePlayer.entity";
import { InGamePlayersRepository } from "src/repository/inGamePlayers.repository";
import { LogRepository } from "src/repository/log.repository";

@Module({
  imports: [
    TypeOrmModule.forFeature([
        Game,
        Logitem,
        Player,
        Group,
        InGamePlayer,
        Log,
    ]),
  ],
  controllers: [GameController],
  providers: [GameService, GameRepository, InGamePlayersRepository, LogRepository],
})
export class GameModule {}

