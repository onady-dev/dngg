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
import { GroupService } from './group.service';
import { PostGroupRequestDto } from './group.request.dto';
import { AuthGuard } from '@nestjs/passport';

@Controller('group')
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Get()
  async getGroupByName(@Query('name') name: string) {
    return this.groupService.getGroupByName(name);
  }

  @Get('/all')
  async getAllGroups() {
    return this.groupService.getAllGroups();
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async createGroup(@Body(ValidationPipe) group: PostGroupRequestDto) {
    return this.groupService.createGroup(group);
  }

  @Delete('/:id')
  @UseGuards(AuthGuard('jwt'))
  async deleteGroup(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.groupService.deleteGroup(id, req.user.groupId);
  }
}
