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
    ThrottlerModule.forRoot([
      { ttl: LOGIN_THROTTLE_TTL_MS, limit: LOGIN_THROTTLE_LIMIT },
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
