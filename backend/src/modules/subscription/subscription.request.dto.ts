import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { BillingCycle } from './subscription.constants';

export class BillingKeyRequestDto {
  @IsNotEmpty()
  @IsString()
  authKey: string;

  @IsNotEmpty()
  @IsIn(['monthly', 'yearly'])
  billingCycle: BillingCycle;
}
