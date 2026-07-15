import { BillingCycle, GRACE_DAYS } from './subscription.constants';

// from을 변경하지 않고 새 Date를 반환한다.
export function addBillingPeriod(from: Date, cycle: BillingCycle): Date {
  const next = new Date(from.getTime());
  if (cycle === 'yearly') {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
}

// 갱신 실패 유예 종료 시점 = periodEnd + graceDays
export function computeGraceEnd(periodEnd: Date, graceDays = GRACE_DAYS): Date {
  const end = new Date(periodEnd.getTime());
  end.setUTCDate(end.getUTCDate() + graceDays);
  return end;
}
