export const VERIFICATION_PURPOSES = ['signup', 'password_reset'] as const;
export type VerificationPurpose = (typeof VERIFICATION_PURPOSES)[number];

export const CODE_TTL_MS = 10 * 60 * 1000; // 코드 만료 10분
export const RESEND_COOLDOWN_MS = 60 * 1000; // 재발송 쿨다운 60초
export const DAILY_SEND_LIMIT = 10; // 이메일당 24시간 발송 한도
export const MAX_CONFIRM_ATTEMPTS = 5; // 코드 확인 시도 한도
export const VERIFICATION_TOKEN_TTL = '15m'; // confirm 후 발급되는 단기 토큰 수명
