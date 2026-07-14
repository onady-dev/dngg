import { BillingCycle } from './subscription.constants';

const DEFAULT_PRICE_MONTHLY = 9900;
const DEFAULT_PRICE_YEARLY = 99000;
const DEFAULT_FREE_GAME_LIMIT = 10;

// 서버 설정값만 사용 — 클라이언트 금액 조작 불가
export function getPrice(cycle: BillingCycle): number {
  if (cycle === 'yearly') {
    return Number(process.env.SUBSCRIPTION_PRICE_YEARLY ?? DEFAULT_PRICE_YEARLY);
  }
  return Number(process.env.SUBSCRIPTION_PRICE_MONTHLY ?? DEFAULT_PRICE_MONTHLY);
}

export function getFreeGameLimit(): number {
  return Number(process.env.FREE_GAME_LIMIT ?? DEFAULT_FREE_GAME_LIMIT);
}
