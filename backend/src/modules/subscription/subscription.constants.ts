export type BillingCycle = 'monthly' | 'yearly';

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'expired';

// 프리미엄이 유지되는(무제한 통과) 상태
export const ACTIVE_STATUSES: SubscriptionStatus[] = ['active', 'past_due'];

// 갱신 결제 실패 후 유예 일수
export const GRACE_DAYS = 3;

// 402 응답에 실어 보내는 에러 코드 (프론트 인터셉터가 이 값을 감지)
export const SUBSCRIPTION_REQUIRED_CODE = 'SUBSCRIPTION_REQUIRED';
