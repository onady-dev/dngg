import { BillingCycle } from './subscription.constants';

const DEFAULT_PRICE_MONTHLY = 9900;
const DEFAULT_PRICE_YEARLY = 99000;
const DEFAULT_FREE_GAME_LIMIT = 10;

// 빈 문자열/공백/비숫자 env는 기본값으로 폴백한다. 명시적 숫자('0' 포함)는 존중.
// (Number('')는 0, Number('abc')는 NaN이 되어 조용히 결제/한도를 망가뜨리는 것을 방지)
function readEnvNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

// 서버 설정값만 사용 — 클라이언트 금액 조작 불가
export function getPrice(cycle: BillingCycle): number {
  return cycle === 'yearly'
    ? readEnvNumber('SUBSCRIPTION_PRICE_YEARLY', DEFAULT_PRICE_YEARLY)
    : readEnvNumber('SUBSCRIPTION_PRICE_MONTHLY', DEFAULT_PRICE_MONTHLY);
}

export function getFreeGameLimit(): number {
  return readEnvNumber('FREE_GAME_LIMIT', DEFAULT_FREE_GAME_LIMIT);
}
