import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AuthGuard('jwt'), AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('monetization')
  getMonetization() {
    return this.adminService.getMonetization();
  }

  @Post('monetization/start')
  startMonetization() {
    return this.adminService.startMonetization(new Date());
  }

  @Get('groups')
  getGroups() {
    return this.adminService.getGroups();
  }

  @Get('subscriptions')
  getSubscriptionOverview() {
    return this.adminService.getSubscriptionOverview();
  }

  @Post('switch-group/:groupId')
  switchGroup(
    @Req() req: any,
    @Param('groupId', ParseIntPipe) groupId: number,
  ) {
    return this.adminService.switchGroup(
      { userId: req.user.userId, email: req.user.email },
      groupId,
    );
  }
}
