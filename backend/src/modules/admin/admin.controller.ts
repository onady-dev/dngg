import { Controller, Get, Post, UseGuards } from '@nestjs/common';
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
}
