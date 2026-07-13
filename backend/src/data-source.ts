import { DataSource } from "typeorm";
import { config } from 'dotenv';
import { Game } from "./entities/Game.entity";
import { Group } from "./entities/Group.entity";
import { InGamePlayer } from "./entities/InGamePlayer.entity";
import { Log } from "./entities/Log.entity";
import { Logitem } from "./entities/Logitem.entity";
import { Player } from "./entities/Player.entity";
import { AddSequenceToLog1709123456789 } from "./migrations/1709123456789-AddSequenceToLog";
import { User } from "./entities/User.entity";

config();

export const AppDataSource = new DataSource({
    type: "postgres",
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "5432"),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    synchronize: false,
    logging: true,
    entities: [Game, Group, InGamePlayer, Log, Logitem, Player, User],
    migrations: [AddSequenceToLog1709123456789],
    subscribers: [],
}); 