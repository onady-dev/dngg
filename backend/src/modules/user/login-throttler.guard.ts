import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// 로그인 시도 제한 창 — 5분에 10회
export const LOGIN_THROTTLE_TTL_MS = 300_000;
export const LOGIN_THROTTLE_LIMIT = 10;

export interface LoginThrottleRequest {
  body?: { identifier?: unknown; email?: unknown };
  ip?: string;
}

// IP가 아니라 아이디 기준으로 센다. 백엔드가 HTTPS 리버스 프록시 뒤에 있는데
// main.ts에 trust proxy 설정이 없어 req.ip가 프록시 IP로 뭉개진다 — IP 기준이면
// 전체 사용자가 한 버킷을 공유해 정상 사용자까지 차단된다.
// 트레이드오프: 특정 그룹의 로그인을 일시적으로 막을 수 있으나, 영구 잠금이 아니라
// 창이 지나면 자동 해제된다.
export function resolveLoginTracker(req: LoginThrottleRequest): string {
  const raw = req.body?.identifier ?? req.body?.email;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return `id:${raw.trim()}`;
  }
  return `ip:${req.ip ?? 'unknown'}`;
}

@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(resolveLoginTracker(req as LoginThrottleRequest));
  }
}
