import { DataSource } from "typeorm";
import { config } from 'dotenv';
import { AppSetting } from "./entities/AppSetting.entity";
import { EmailVerification } from "./entities/EmailVerification.entity";
import { Game } from "./entities/Game.entity";
import { Group } from "./entities/Group.entity";
import { InGamePlayer } from "./entities/InGamePlayer.entity";
import { Inquiry } from "./entities/Inquiry.entity";
import { Log } from "./entities/Log.entity";
import { Logitem } from "./entities/Logitem.entity";
import { Payment } from "./entities/Payment.entity";
import { Player } from "./entities/Player.entity";
import { Subscription } from "./entities/Subscription.entity";
import { Team } from "./entities/Team.entity";
import { TeamPlayer } from "./entities/TeamPlayer.entity";
import { User } from "./entities/User.entity";
import { AddSequenceToLog1709123456789 } from "./migrations/1709123456789-AddSequenceToLog";

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
    // src/entities/*.entity.ts 전부를 등록한다. 하나라도 빠지면
    // migration:generate가 그 테이블을 DROP하는 마이그레이션을 만든다.
    // data-source.spec.ts가 디렉토리와 이 목록이 어긋나면 실패시킨다.
    entities: [
        AppSetting,
        EmailVerification,
        Game,
        Group,
        InGamePlayer,
        Inquiry,
        Log,
        Logitem,
        Payment,
        Player,
        Subscription,
        Team,
        TeamPlayer,
        User,
    ],
    migrations: [AddSequenceToLog1709123456789],
    subscribers: [],
}); 