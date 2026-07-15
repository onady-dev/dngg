import { getPrice, getFreeGameLimit } from './subscription.config';

describe('subscription.config', () => {
  const KEYS = [
    'SUBSCRIPTION_PRICE_MONTHLY',
    'SUBSCRIPTION_PRICE_YEARLY',
    'FREE_GAME_LIMIT',
  ];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    KEYS.forEach((k) => (saved[k] = process.env[k]));
    KEYS.forEach((k) => delete process.env[k]);
  });
  afterEach(() => {
    KEYS.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  });

  test('미설정 시 기본값(9900/99000/10)을 쓴다', () => {
    expect(getPrice('monthly')).toBe(9900);
    expect(getPrice('yearly')).toBe(99000);
    expect(getFreeGameLimit()).toBe(10);
  });

  test('유효한 숫자 env는 그대로 사용한다', () => {
    process.env.SUBSCRIPTION_PRICE_MONTHLY = '12000';
    process.env.FREE_GAME_LIMIT = '5';
    expect(getPrice('monthly')).toBe(12000);
    expect(getFreeGameLimit()).toBe(5);
  });

  test('빈 문자열 env는 기본값으로 폴백한다 (₩0 방지)', () => {
    process.env.SUBSCRIPTION_PRICE_MONTHLY = '';
    expect(getPrice('monthly')).toBe(9900);
  });

  test('비숫자 env는 기본값으로 폴백한다 (NaN 방지)', () => {
    process.env.FREE_GAME_LIMIT = 'abc';
    expect(getFreeGameLimit()).toBe(10);
  });

  test("명시적 '0'은 존중한다", () => {
    process.env.SUBSCRIPTION_PRICE_MONTHLY = '0';
    expect(getPrice('monthly')).toBe(0);
  });
});
