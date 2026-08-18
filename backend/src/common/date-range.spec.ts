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

  test('실재하지 않는 날짜는 형식이 맞아도 BadRequestException을 던진다', () => {
    expect(() => assertValidDateRange('2026-02-30', undefined)).toThrow(
      BadRequestException,
    );
    expect(() => assertValidDateRange('2026-13-01', undefined)).toThrow(
      BadRequestException,
    );
    expect(() => assertValidDateRange('2026-00-01', undefined)).toThrow(
      BadRequestException,
    );
    expect(() => assertValidDateRange(undefined, '2026-04-31')).toThrow(
      BadRequestException,
    );
  });

  test('평년의 2월 29일은 BadRequestException을 던진다', () => {
    expect(() => assertValidDateRange('2026-02-29', undefined)).toThrow(
      BadRequestException,
    );
  });

  test('윤년의 2월 29일과 경계 날짜는 통과한다', () => {
    expect(() => assertValidDateRange('2024-02-29', undefined)).not.toThrow();
    expect(() =>
      assertValidDateRange('2026-01-01', '2026-12-31'),
    ).not.toThrow();
  });
});
