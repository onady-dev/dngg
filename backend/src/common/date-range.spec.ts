import { BadRequestException } from '@nestjs/common';
import { assertValidDateRange } from './date-range';

describe('assertValidDateRange', () => {
  test('둘 다 없으면 통과한다', () => {
    expect(() => assertValidDateRange(undefined, undefined)).not.toThrow();
  });

  test('올바른 범위는 통과한다', () => {
    expect(() =>
      assertValidDateRange('2026-01-01', '2026-12-31'),
    ).not.toThrow();
  });

  test('같은 날짜는 통과한다', () => {
    expect(() =>
      assertValidDateRange('2026-05-05', '2026-05-05'),
    ).not.toThrow();
  });

  test('한쪽만 있어도 통과한다', () => {
    expect(() => assertValidDateRange('2026-01-01', undefined)).not.toThrow();
    expect(() => assertValidDateRange(undefined, '2026-12-31')).not.toThrow();
  });

  test('형식이 틀리면 BadRequestException을 던진다', () => {
    expect(() => assertValidDateRange('2026-1-1', undefined)).toThrow(
      BadRequestException,
    );
    expect(() => assertValidDateRange('abc', undefined)).toThrow(
      BadRequestException,
    );
    expect(() => assertValidDateRange(undefined, '2026/12/31')).toThrow(
      BadRequestException,
    );
  });

  test('from이 to보다 뒤면 BadRequestException을 던진다', () => {
    expect(() => assertValidDateRange('2026-12-31', '2026-01-01')).toThrow(
      BadRequestException,
    );
  });
});
