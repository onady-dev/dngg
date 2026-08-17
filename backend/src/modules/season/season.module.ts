import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Season } from 'src/entities/Season.entity';
import { Group } from 'src/entities/Group.entity';
import { Game } from 'src/entities/Game.entity';
import { SeasonService } from './season.service';
import { SeasonController } from './season.controller';
import { SeasonRepository } from 'src/repository/season.repository';

@Module({
  // Game은 삭제 트랜잭션에서 manager.update(Game, ...)로 쓴다.
  imports: [TypeOrmModule.forFeature([Season, Group, Game])],
  controllers: [SeasonController],
  providers: [SeasonService, SeasonRepository],
})
export class SeasonModule {}
