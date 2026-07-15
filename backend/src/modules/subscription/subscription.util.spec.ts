import { addBillingPeriod, computeGraceEnd } from './subscription.util';

describe('subscription.util', () => {
  describe('addBillingPeriod', () => {
    test('monthly는 한 달을 더한다', () => {
      const result = addBillingPeriod(
        new Date('2026-01-15T00:00:00Z'),
        'monthly',
      );
      expect(result.toISOString()).toBe('2026-02-15T00:00:00.000Z');
    });

    test('yearly는 일 년을 더한다', () => {
      const result = addBillingPeriod(
        new Date('2026-01-15T00:00:00Z'),
        'yearly',
      );
      expect(result.toISOString()).toBe('2027-01-15T00:00:00.000Z');
    });

    test('원본 Date를 변경하지 않는다 (불변)', () => {
      const from = new Date('2026-01-15T00:00:00Z');
      addBillingPeriod(from, 'monthly');
      expect(from.toISOString()).toBe('2026-01-15T00:00:00.000Z');
    });
  });

  describe('computeGraceEnd', () => {
    test('기본 3일을 더한다', () => {
      const result = computeGraceEnd(new Date('2026-01-15T00:00:00Z'));
      expect(result.toISOString()).toBe('2026-01-18T00:00:00.000Z');
    });
  });
});
