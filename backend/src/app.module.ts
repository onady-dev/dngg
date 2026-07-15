import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupModule } from './modules/group/group.module';
import { LoggerMiddleware } from './middlewares/logger.middleware';
import { WinstonModule } from 'nest-winston';
import { GameModule } from './modules/game/game.module';
import { LogitemModule } from './modules/logitem/logitem.module';
import { PlayerModule } from './modules/player/player.module';
import { APP_FILTER } from '@nestjs/core';
import { HttpExceptionFilter } from './httpExceptionFilter';
import { LogModule } from './modules/log/log.module';
import { UserModule } from './modules/user/user.module';
import { TeamModule } from './modules/team/team.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { AdminModule } from './modules/admin/admin.module';
import * as winston from 'winston';

const { combine, timestamp, printf, colorize } = winston.format;
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // true 지정 시 다른 모듈에서 import 하지 않고 바로 사용 가능
      envFilePath: `.env.${process.env.NODE_ENV}`, // 접근 가능한 환경변수 목록
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      entities: ['dist/entities/*.entity.js'],
      autoLoadEntities: true,
      synchronize: true,
      logging: false,
    }),
    WinstonModule.forRoot({
      transports: [
        new winston.transports.Console({
          format: combine(
            timestamp({
              format: 'YYYY-MM-DD HH:mm:ss.SSS',
            }),
            colorize(),
            printf(({ timestamp, level, message, context, trace }) => {
              const messageStr =
                typeof message === 'object'
                  ? JSON.stringify(message, null, 2)
                  : message;
              const contextStr = context ? `[${context}] ` : '';
              const traceStr = trace ? `\n${trace}` : '';
              return `${timestamp} [${level}] ${contextStr}${messageStr}${traceStr}`;
            }),
          ),
        }),
      ],
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    }),
    GroupModule,
    GameModule,
    LogitemModule,
    PlayerModule,
    LogModule,
    UserModule,
    TeamModule,
    SubscriptionModule,
    AdminModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): any {
    // 로깅
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
