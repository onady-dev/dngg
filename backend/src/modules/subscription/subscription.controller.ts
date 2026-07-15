import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SubscriptionService } from './subscription.service';
import { BillingKeyRequestDto } from './subscription.request.dto';

@Controller('subscription')
@UseGuards(AuthGuard('jwt'))
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('status')
  async getStatus(@Request() req) {
    return this.subscriptionService.getStatus(req.user.groupId);
  }

  @Post('billing-key')
  async createBillingKey(
    @Request() req,
    @Body(ValidationPipe) dto: BillingKeyRequestDto,
  ) {
    return this.subscriptionService.subscribe(
      req.user.groupId,
      req.user.userId,
      dto,
    );
  }

  @Post('cancel')
  async cancel(@Request() req) {
    return this.subscriptionService.cancel(req.user.groupId);
  }

  @Post('resume')
  async resume(@Request() req) {
    return this.subscriptionService.resume(req.user.groupId);
  }

  @Get('payments')
  async getPayments(@Request() req, @Query('page') page?: string) {
    return this.subscriptionService.getPayments(
      req.user.groupId,
      page ? Number(page) : 1,
    );
  }
}
