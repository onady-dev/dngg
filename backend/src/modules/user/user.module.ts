import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/User.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { UserRepository } from '../../repository/user.repository';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { GroupRepository } from 'src/repository/group.repository';
import { Group } from 'src/entities/Group.entity';
import { ConfigModule, ConfigService } from '@nestjs/config';

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
    TypeOrmModule.forFeature([User, Group]),
  ],
  controllers: [UserController],
  providers: [UserService, JwtStrategy, UserRepository, GroupRepository],
})
export class UserModule {} 