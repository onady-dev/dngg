import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionService } from './subscription.service';

@Injectable()
export class SubscriptionRenewalCron {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  // 매일 새벽 4시(서버 시각) 1회. 단일 인스턴스이므로 중복 실행 없음.
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async handleRenewal(): Promise<void> {
    await this.subscriptionService.renewDueSubscriptions(new Date());
  }
}
