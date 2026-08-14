import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Request,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { LogService } from './log.service';
import {
  GetLogByDailyRequestDto,
  GetDailyDatesRequestDto,
  GetRankingsRequestDto,
  PostLogRequestDto,
} from './log.request.dto';
import { Player } from 'src/entities/Player.entity';
import { AuthGuard } from '@nestjs/passport';
import { assertSameGroup } from 'src/common/group-access';

@Controller('log')
export class LogController {
  constructor(private readonly logService: LogService) {}

  @Get()
  async getLogByGroupId(@Query('groupId') groupId: number) {
    return this.logService.getLogByGroupId(groupId);
  }

  @Get('/rankings')
  async getRankings(@Query(ValidationPipe) dto: GetRankingsRequestDto) {
    return this.logService.getRankings(dto.groupId, dto.seasonId);
  }

  @Get('/daily')
  async getLogByDaily(@Query(ValidationPipe) dto: GetLogByDailyRequestDto) {
    return await this.logService.getLogByDaily(dto.date, dto.groupId);
  }

  @Get('/daily/dates')
  async getDailyDates(@Query(ValidationPipe) dto: GetDailyDatesRequestDto) {
    return this.logService.getDailyDates(dto.groupId);
  }

  @Get('/daily/games')
  async getDailyGames(@Query(ValidationPipe) dto: GetLogByDailyRequestDto) {
    return this.logService.getDailyGames(dto.date, dto.groupId);
  }

  @Get('/game/:id')
  async getLogByGameId(@Param('id') id: number) {
    return this.logService.getLogByGameId(id);
  }

  @Get('/player/:id')
  async getLogByPlayerId(
    @Param('id') id: number,
    @Query('seasonId', new ParseIntPipe({ optional: true }))
    seasonId?: number,
  ) {
    return this.logService.getLogByPlayerId(id, seasonId);
  }

  @Get('/logitem')
  async getLogByLogId(
    @Query('groupId') groupId: number,
    @Query('logitemId') logitemId: number,
  ) {
    return this.logService.getLogByLogItemIdAndGroupId(logitemId, groupId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async createLog(
    @Request() req,
    @Body(ValidationPipe) log: PostLogRequestDto,
  ) {
    assertSameGroup(req.user.groupId, log.groupId);
    return this.logService.createLog(log, req.user.groupId);
  }

  @Delete('/game/:id/undo')
  @UseGuards(AuthGuard('jwt'))
  async undoLastLog(@Request() req, @Param('id') gameId: number) {
    return this.logService.undoLastLog(gameId, req.user.groupId);
  }

  @Post('/game/:id/redo')
  @UseGuards(AuthGuard('jwt'))
  async redoLog(
    @Request() req,
    @Param('id') gameId: number,
    @Body('sequence') sequence: number,
  ) {
    return this.logService.redoLog(gameId, sequence, req.user.groupId);
  }
}
