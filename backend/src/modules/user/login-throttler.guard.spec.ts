import {
  LOGIN_THROTTLE_LIMIT,
  LOGIN_THROTTLE_TTL_MS,
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
