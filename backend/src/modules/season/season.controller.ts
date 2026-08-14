import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { assertSameGroup } from 'src/common/group-access';
import { SeasonService } from './season.service';
import {
  GetSeasonsRequestDto,
  PostSeasonRequestDto,
  PutCurrentSeasonRequestDto,
  PutSeasonRequestDto,
} from './season.request.dto';

@Controller('season')
export class SeasonController {
  constructor(private readonly seasonService: SeasonService) {}

  @Get()
  async getSeasons(@Query(ValidationPipe) dto: GetSeasonsRequestDto) {
    return this.seasonService.getSeasons(dto.groupId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async createSeason(
    @Request() req,
    @Body(ValidationPipe) dto: PostSeasonRequestDto,
  ) {
    assertSameGroup(req.user.groupId, dto.groupId);
    return this.seasonService
      .createSeason({ groupId: dto.groupId, name: dto.name })
      .catch((error) => {
        if (error?.driverError?.code === '23505') {
          throw new BadRequestException('이미 있는 시즌 이름입니다.');
        }
        throw error;
      });
  }

  // 현재 시즌 지정은 :id 라우트보다 먼저 선언해야 'current'가 id로 해석되지 않는다.
  @Put('current')
  @UseGuards(AuthGuard('jwt'))
  async setCurrentSeason(
    @Request() req,
    @Body(ValidationPipe) dto: PutCurrentSeasonRequestDto,
  ) {
    assertSameGroup(req.user.groupId, dto.groupId);
    return this.seasonService.setCurrentSeason(dto.groupId, dto.seasonId);
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'))
  async renameSeason(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body(ValidationPipe) dto: PutSeasonRequestDto,
  ) {
    assertSameGroup(req.user.groupId, dto.groupId);
    return this.seasonService
      .renameSeason(id, dto.groupId, dto.name)
      .catch((error) => {
        if (error?.driverError?.code === '23505') {
          throw new BadRequestException('이미 있는 시즌 이름입니다.');
        }
        throw error;
      });
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  async deleteSeason(@Request() req, @Param('id', ParseIntPipe) id: number) {
    // 쿼리의 groupId는 신뢰하지 않고 JWT의 groupId로 소유권을 검증한다.
    return this.seasonService.deleteSeason(id, req.user.groupId);
  }
}
