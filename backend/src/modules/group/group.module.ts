import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Game } from "src/entities/Game.entity";
import { Group } from "src/entities/Group.entity";
import { Player } from "src/entities/Player.entity";
import { GroupController } from "./group.controller";
import { GroupService } from "./group.service";
import { Logitem } from "src/entities/Logitem.entity";
import { GroupRepository } from "src/repository/group.repository";

@Module({
  imports: [
    TypeOrmModule.forFeature([
        Game,
        Logitem,
        Player,
        Group,
    ]),
  ],
  controllers: [GroupController],
  providers: [GroupService, GroupRepository],
})
export class GroupModule {}

