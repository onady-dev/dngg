import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { GameService } from './game.service';
import {
  PostGameAndLogsRequestDto,
  PostGameRequestDto,
  PatchGameQuarterRequestDto,
  PutGameSeasonRequestDto,
} from './game.request.dto';
import { AuthGuard } from '@nestjs/passport';
import { assertSameGroup } from 'src/common/group-access';
import { assertValidDateRange } from 'src/common/date-range';

@Controller('game')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  // 파라미터 라우트(:id)보다 먼저 선언해야 'season'이 id로 해석되지 않는다.
  @Put('season')
  @UseGuards(AuthGuard('jwt'))
  async assignSeason(
    @Request() req,
    @Body(ValidationPipe) dto: PutGameSeasonRequestDto,
  ) {
    assertSameGroup(req.user.groupId, dto.groupId);
    return this.gameService.assignSeason({
      groupId: dto.groupId,
      gameIds: dto.gameIds,
      seasonId: dto.seasonId,
    });
  }

  @Get()
  async getGameByGroupId(
    @Query('groupId') groupId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    // DTO가 없는 경로라 전역 ValidationPipe가 관여하지 않는다 — 여기서 막아야 한다.
    assertValidDateRange(from, to);
    return this.gameService.getGames(groupId, {
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      status,
      from,
      to,
    });
  }

  @Get(':id')
  async getGameById(@Param('id') id: number) {
    return this.gameService.getGameById(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  async updateGameStatus(
    @Request() req,
    @Param('id') id: number,
    @Body('status') status: string,
  ) {
    return this.gameService.updateGameStatus(id, status, req.user.groupId);
  }

  @Patch(':id/quarter')
  @UseGuards(AuthGuard('jwt'))
  async updateGameQuarter(
    @Request() req,
    @Param('id') id: number,
    @Body(ValidationPipe) dto: PatchGameQuarterRequestDto,
  ) {
    return this.gameService.updateGameQuarter(id, dto.quarter, req.user.groupId);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  async deleteGame(@Request() req, @Param('id') id: number) {
    // 쿼리의 groupId는 신뢰하지 않고 JWT의 groupId로 소유권을 검증한다.
    return this.gameService.deleteGame(id, req.user.groupId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async saveGameAndLogs(
    @Request() req,
    @Body(ValidationPipe) dto: PostGameAndLogsRequestDto,
  ) {
    assertSameGroup(req.user.groupId, dto.groupId);
    return this.gameService.saveGameAndLogs(
      dto,
      req.user.groupId,
      req.user.role,
    );
  }
}
