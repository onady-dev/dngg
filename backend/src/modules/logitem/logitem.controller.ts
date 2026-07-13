import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { LogitemService } from './logitem.service';
import { PostLogitemRequestDto } from './logitem.request.dto';
import { AuthGuard } from '@nestjs/passport';
import { assertSameGroup } from 'src/common/group-access';

@Controller('logitem')
export class LogitemController {
  constructor(private readonly logitemService: LogitemService) {}

  @Get()
  async getLogitemByGroupId(@Query('groupId') groupId: number) {
    return this.logitemService.getLogitemByGroupId(groupId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async createLogitem(
    @Request() req,
    @Body(ValidationPipe) logitem: PostLogitemRequestDto,
  ) {
    assertSameGroup(req.user.groupId, logitem.groupId);
    return this.logitemService.createLogitem(logitem);
  }
}
