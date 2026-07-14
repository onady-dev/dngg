import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from 'src/entities/Subscription.entity';
import { Payment } from 'src/entities/Payment.entity';
import { Group } from 'src/entities/Group.entity';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { TossBillingClient } from './toss-billing.client';
import { SubscriptionRenewalCron } from './subscription-renewal.cron';

@Module({
  imports: [TypeOrmModule.forFeature([Subscription, Payment, Group])],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, TossBillingClient, SubscriptionRenewalCron],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
