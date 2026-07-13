import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Game } from "src/entities/Game.entity";
import { Group } from "src/entities/Group.entity";
import { Player } from "src/entities/Player.entity";
import { LogitemService } from "./logitem.service";
import { LogitemController } from "./logitem.controller";
import { Logitem } from "src/entities/Logitem.entity";
import { LogitemRepository } from "src/repository/config.repository";

@Module({
  imports: [
    TypeOrmModule.forFeature([
        Game,
        Logitem,
        Player,
        Group,
    ]),
  ],
  controllers: [LogitemController],
  providers: [LogitemService, LogitemRepository],
})
export class LogitemModule {}

