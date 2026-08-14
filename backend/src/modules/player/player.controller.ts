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
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { PlayerService } from './player.service';
import { PostPlayerRequestDto } from './player.request.dto';
import { AuthGuard } from '@nestjs/passport';
import { assertSameGroup } from 'src/common/group-access';

@Controller('player')
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  @Get()
  async getPlayerByGroupId(@Query('groupId') groupId: number) {
    return this.playerService.getPlayerByGroupId(groupId);
  }

  @Get(':id')
  async getPlayerByPlayerId(@Param('id', ParseIntPipe) id: number) {
    return this.playerService.getPlayerByPlayerId(id);
  }

  @Get(':id/ability')
  async getPlayerAbility(
    @Param('id', ParseIntPipe) id: number,
    @Query('seasonId') seasonId?: string,
  ) {
    return this.playerService.getPlayerAbility(
      id,
      seasonId ? Number(seasonId) : undefined,
    );
  }

  @Get(':id/team-impact')
  async getPlayerTeamImpact(
    @Param('id', ParseIntPipe) id: number,
    @Query('seasonId') seasonId?: string,
  ) {
    return this.playerService.getPlayerTeamImpact(
      id,
      seasonId ? Number(seasonId) : undefined,
    );
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async createPlayer(
    @Request() req,
    @Body(ValidationPipe) dto: PostPlayerRequestDto,
  ) {
    assertSameGroup(req.user.groupId, dto.groupId);
    return this.playerService.createPlayer(dto).catch((error) => {
      if (error.driverError.code === '23505') {
        throw new BadRequestException('Player already exists');
      }
      throw error;
    });
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'))
  async updatePlayer(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body(ValidationPipe) dto: PostPlayerRequestDto,
  ) {
    assertSameGroup(req.user.groupId, dto.groupId);
    return this.playerService.updatePlayer(id, dto, req.user.groupId);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  async deletePlayer(@Request() req, @Param('id', ParseIntPipe) id: number) {
    // 쿼리의 groupId는 신뢰하지 않고 JWT의 groupId로 소유권을 검증한다.
    return this.playerService.deletePlayer(id, req.user.groupId);
  }

  @Get('total-games-played/:id')
  async getTotalGamesPlayed(@Param('id', ParseIntPipe) id: number) {
    return this.playerService.getTotalGamesPlayed(id);
  }
}
