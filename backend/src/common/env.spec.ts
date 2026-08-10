import { readPositiveInt } from './env';

describe('readPositiveInt', () => {
  test('양의 정수 문자열을 파싱한다', () => {
    expect(readPositiveInt('20', 10)).toBe(20);
  });

  test('미설정·비정수·0·음수는 기본값으로 폴백한다', () => {
    expect(readPositiveInt(undefined, 10)).toBe(10);
    expect(readPositiveInt('', 10)).toBe(10);
    expect(readPositiveInt('abc', 10)).toBe(10);
    expect(readPositiveInt('0', 10)).toBe(10);
    expect(readPositiveInt('-5', 10)).toBe(10);
    expect(readPositiveInt('1.5', 10)).toBe(10);
  });
});
