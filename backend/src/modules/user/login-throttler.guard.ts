import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { readPositiveInt } from '../../common/env';

// 로그인 시도 제한 창(아이디 기준) — 5분에 10회
export const LOGIN_THROTTLE_TTL_MS = 300_000;
export const LOGIN_THROTTLE_LIMIT = 10;

// 사이트 전체 로그인 시도 제한 창(아이디 무관, 전역 1버킷) — 5분에 300회.
// 아이디 기준 제한은 "한 계정에 비밀번호 여러 개"(수직 브루트포스)는 막지만,
// "여러 계정에 비밀번호 하나씩"(수평 스프레이 — GET /group/all로 그룹명을 모두
// 긁어 각각 1회씩 시도)은 각 시도가 서로 다른 버킷에 떨어져 전혀 막지 못한다.
// 이 굵은 버킷이 그 경우를 잡는다. 정상 트래픽에는 영향이 없도록 넉넉하게 잡았다.
export const SITEWIDE_LOGIN_THROTTLE_TTL_MS = 300_000;
export const DEFAULT_SITEWIDE_LOGIN_THROTTLE_LIMIT = 300;

// 이 버킷은 전역 단일 키라, 스파이크로 정상 사용자가 한꺼번에 몰리면 서비스가
// 스스로를 잠글 수 있다. 재배포 없이 .env + 컨테이너 재시작만으로 올릴 수 있게
// 환경변수를 받는다.
export function resolveSitewideLoginLimit(env: NodeJS.ProcessEnv): number {
  return readPositiveInt(
    env.SITEWIDE_LOGIN_THROTTLE_LIMIT,
    DEFAULT_SITEWIDE_LOGIN_THROTTLE_LIMIT,
  );
}

export const SITEWIDE_LOGIN_THROTTLER_NAME = 'login-sitewide';
export const PER_IDENTIFIER_LOGIN_THROTTLER_NAME = 'login-per-identifier';

// 전역 버킷은 요청마다 동일한 상수 키로 수렴시킨다.
const SITEWIDE_LOGIN_THROTTLE_KEY = 'sitewide';

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

// 저장소 특성: @nestjs/throttler 6.5.0의 기본 스토리지(ThrottlerStorageService)는
// 프로세스 메모리 내 Map이다 — 키의 히트 카운트는 TTL이 지나면 0으로 줄어들지만
// Map 엔트리 자체는 절대 삭제되지 않는다(node_modules/.pnpm/@nestjs+throttler@6.5.0/
// .../dist/throttler.service.js의 increment/setExpirationTime 참고). 그래서 아이디
// 기준 버킷은 무한정 늘어날 수 있는 키 공간이라 이 스토리지에 얹으면 위험하다 — 굵은
// 전역 버킷이 있어야 스프레이형 공격이 무한정 새 키를 만들기 전에 먼저 막힌다.
// 또한 카운터는 프로세스 단위다: 재시작/재배포에 초기화되고, 현재는 백엔드 컨테이너가
// 1개뿐이라 문제가 없지만 나중에 레플리카를 여러 개로 늘리면(코드상 아무 감지 신호도
// 없이) 유효 한도가 N배로 느슨해진다 — 공유 스토리지(Redis 등)로 옮기지 않는 한.
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(resolveLoginTracker(req as LoginThrottleRequest));
  }

  // 굵은 전역 버킷(SITEWIDE_LOGIN_THROTTLER_NAME)은 트래커 값과 무관하게 상수 키로
  // 수렴시킨다. 아이디 기준 버킷(PER_IDENTIFIER_LOGIN_THROTTLER_NAME)은 부모 클래스의
  // 기본 동작(트래커 문자열을 해시해 키로 씀)을 그대로 쓴다.
  protected generateKey(
    context: ExecutionContext,
    suffix: string,
    name: string,
  ): string {
    if (name === SITEWIDE_LOGIN_THROTTLER_NAME) {
      return `${name}-${SITEWIDE_LOGIN_THROTTLE_KEY}`;
    }
    return super.generateKey(context, suffix, name);
  }
}
