import {
  LOGIN_THROTTLE_LIMIT,
  LOGIN_THROTTLE_TTL_MS,
  LoginThrottlerGuard,
  resolveLoginTracker,
} from './login-throttler.guard';

describe('resolveLoginTracker', () => {
  test('바디의 identifier를 키로 쓴다', () => {
    expect(
      resolveLoginTracker({ body: { identifier: '월요농구' }, ip: '1.2.3.4' }),
    ).toBe('id:월요농구');
  });

  test('앞뒤 공백을 제거해 같은 버킷으로 모은다', () => {
    expect(resolveLoginTracker({ body: { identifier: '  월요농구 ' } })).toBe(
      'id:월요농구',
    );
  });

  test('identifier가 없으면 레거시 email 키를 쓴다', () => {
    expect(resolveLoginTracker({ body: { email: 'a@b.co' } })).toBe(
      'id:a@b.co',
    );
  });

  test('아이디가 없거나 빈 문자열이면 IP로 폴백한다', () => {
    expect(
      resolveLoginTracker({ body: { identifier: '   ' }, ip: '1.2.3.4' }),
    ).toBe('ip:1.2.3.4');
    expect(resolveLoginTracker({ body: {}, ip: '1.2.3.4' })).toBe('ip:1.2.3.4');
    expect(resolveLoginTracker({})).toBe('ip:unknown');
  });

  test('문자열이 아닌 아이디는 IP로 폴백한다', () => {
    expect(
      resolveLoginTracker({
        body: { identifier: { $ne: null } },
        ip: '1.2.3.4',
      }),
    ).toBe('ip:1.2.3.4');
  });

  test('한도는 5분에 10회다', () => {
    expect(LOGIN_THROTTLE_TTL_MS).toBe(300_000);
    expect(LOGIN_THROTTLE_LIMIT).toBe(10);
  });
});

// getTracker 메서드명이 오타 나면(예: getTraker) 부모 클래스의 기본 구현으로 조용히
// 폴백해 req.ip를 쓰게 된다 — 아이디 기준 설계 전체가 그린 스위트인 채로 무너진다.
// resolveLoginTracker 자체가 아니라 가드 인스턴스의 protected 메서드를 직접 호출해
// 오버라이드가 실제로 걸려있는지 검증한다.
describe('LoginThrottlerGuard.getTracker', () => {
  test('req의 identifier를 트래커로 반환한다 (부모의 req.ip 폴백이 아니라)', async () => {
    // ThrottlerGuard 생성자 의존성은 이 메서드 테스트에 필요 없어 프로토타입 메서드를
    // 직접 호출한다 — DI 컨테이너 구성 없이 오버라이드 여부만 확인.
    const guard = Object.create(
      LoginThrottlerGuard.prototype,
    ) as LoginThrottlerGuard;
    const tracker = await (
      guard as unknown as {
        getTracker: (req: Record<string, unknown>) => Promise<string>;
      }
    ).getTracker({ body: { identifier: '월요농구' }, ip: '9.9.9.9' });

    expect(tracker).toBe('id:월요농구');
    expect(tracker).not.toBe('9.9.9.9');
  });
});
