import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TeamService } from './team.service';
import {
  BulkTeamsRequestDto,
  PostTeamRequestDto,
  PutTeamRequestDto,
} from './team.request.dto';

@Controller('team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get()
  async getTeamsByGroupId(@Query('groupId') groupId: number) {
    return this.teamService.getTeamsByGroupId(groupId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async createTeam(
    @Request() req,
    @Body(ValidationPipe) dto: PostTeamRequestDto,
  ) {
    this.assertOwnGroup(req, dto.groupId);
    return this.teamService.createTeam(dto).catch((error) => {
      if (error?.driverError?.code === '23505') {
        throw new BadRequestException('Team already exists');
      }
      throw error;
    });
  }

  @Post('bulk')
  @UseGuards(AuthGuard('jwt'))
  async bulkCreateTeams(
    @Request() req,
    @Body(ValidationPipe) dto: BulkTeamsRequestDto,
  ) {
    this.assertOwnGroup(req, dto.groupId);
    return this.teamService.bulkCreateTeams(dto).catch((error) => {
      if (error?.driverError?.code === '23505') {
        throw new BadRequestException('Team already exists');
      }
      throw error;
    });
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'))
  async updateTeam(
    @Request() req,
    @Param('id') id: number,
    @Body(ValidationPipe) dto: PutTeamRequestDto,
  ) {
    this.assertOwnGroup(req, dto.groupId);
    return this.teamService.updateTeam(id, dto).catch((error) => {
      if (error?.driverError?.code === '23505') {
        throw new BadRequestException('Team already exists');
      }
      throw error;
    });
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  async deleteTeam(
    @Request() req,
    @Param('id') id: number,
    @Query('groupId') groupId: number,
  ) {
    this.assertOwnGroup(req, Number(groupId));
    return this.teamService.deleteTeam(id, Number(groupId));
  }

  @Delete()
  @UseGuards(AuthGuard('jwt'))
  async deleteAllTeams(@Request() req, @Query('groupId') groupId: number) {
    this.assertOwnGroup(req, Number(groupId));
    return this.teamService.deleteAllTeams(Number(groupId));
  }

  // 본인 소속 그룹의 팀만 수정할 수 있다 (JWT payload의 groupId 기준)
  private assertOwnGroup(req, groupId: number) {
    if (Number(req.user?.groupId) !== Number(groupId)) {
      throw new ForbiddenException('Cannot manage teams of another group');
    }
  }
}
