import { ForbiddenException } from '@nestjs/common';
import { assertSameGroup } from './group-access';

describe('assertSameGroup', () => {
  test('같은 그룹이면 통과한다', () => {
    expect(() => assertSameGroup(1, 1)).not.toThrow();
  });

  test('숫자/문자열 타입이 섞여도 값이 같으면 통과한다', () => {
    expect(() => assertSameGroup(1, '1')).not.toThrow();
    expect(() => assertSameGroup('2', 2)).not.toThrow();
  });

  test('다른 그룹이면 ForbiddenException을 던진다', () => {
    expect(() => assertSameGroup(1, 2)).toThrow(ForbiddenException);
  });

  test('userGroupId가 없으면 ForbiddenException을 던진다', () => {
    expect(() => assertSameGroup(undefined, 1)).toThrow(ForbiddenException);
  });

  test('resourceGroupId가 없으면 ForbiddenException을 던진다', () => {
    expect(() => assertSameGroup(1, undefined)).toThrow(ForbiddenException);
  });
});
