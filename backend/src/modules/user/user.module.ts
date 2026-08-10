import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/User.entity';
import { EmailVerification } from '../../entities/EmailVerification.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { UserRepository } from '../../repository/user.repository';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { GroupRepository } from 'src/repository/group.repository';
import { Group } from 'src/entities/Group.entity';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailModule } from '../mail/mail.module';
import { EmailVerificationService } from './email-verification.service';
import { ThrottlerModule } from '@nestjs/throttler';
import {
  LOGIN_THROTTLE_LIMIT,
  LOGIN_THROTTLE_TTL_MS,
  LoginThrottlerGuard,
  PER_IDENTIFIER_LOGIN_THROTTLER_NAME,
  resolveSitewideLoginLimit,
  SITEWIDE_LOGIN_THROTTLE_TTL_MS,
  SITEWIDE_LOGIN_THROTTLER_NAME,
} from './login-throttler.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
      }),
    }),
    TypeOrmModule.forFeature([User, Group, EmailVerification]),
    MailModule,
    // 전역 가드로 걸지 않는다 — /user/login에만 @UseGuards로 붙인다.
    // 순서가 중요하다: ThrottlerGuard는 배열 순서대로 각 스로틀러를 평가하고 처음
    // 초과한 곳에서 던진다. 두 ttl이 같아(둘 다 300000ms) onModuleInit의 ttl 기준
    // 정렬이 안정 정렬로 원래 순서를 유지하므로, 전역 버킷을 먼저 둬야 스프레이형
    // 공격이 아이디 기준 버킷에 새 키를 무한정 채우기 전에 먼저 걸린다.
    ThrottlerModule.forRoot([
      {
        name: SITEWIDE_LOGIN_THROTTLER_NAME,
        ttl: SITEWIDE_LOGIN_THROTTLE_TTL_MS,
        limit: resolveSitewideLoginLimit(process.env),
      },
      {
        name: PER_IDENTIFIER_LOGIN_THROTTLER_NAME,
        ttl: LOGIN_THROTTLE_TTL_MS,
        limit: LOGIN_THROTTLE_LIMIT,
      },
    ]),
  ],
  controllers: [UserController],
  providers: [
    UserService,
    EmailVerificationService,
    JwtStrategy,
    UserRepository,
    GroupRepository,
    LoginThrottlerGuard,
  ],
})
export class UserModule {}
