import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { GameService } from './game.service';
import {
  PostGameAndLogsRequestDto,
  PostGameRequestDto,
} from './game.request.dto';
import { AuthGuard } from '@nestjs/passport';
import { assertSameGroup } from 'src/common/group-access';

@Controller('game')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Get()
  async getGameByGroupId(
    @Query('groupId') groupId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.gameService.getGames(groupId, {
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      status,
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
