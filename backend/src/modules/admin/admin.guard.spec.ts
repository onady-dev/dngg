import { ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  const contextWithRole = (role?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : undefined }),
      }),
    }) as any;

  test('role이 admin이면 통과한다', () => {
    const guard = new AdminGuard();
    expect(guard.canActivate(contextWithRole('admin'))).toBe(true);
  });

  test('role이 user면 403을 던진다', () => {
    const guard = new AdminGuard();
    expect(() => guard.canActivate(contextWithRole('user'))).toThrow(
      ForbiddenException,
    );
  });

  test('user 객체가 없으면 403을 던진다', () => {
    const guard = new AdminGuard();
    expect(() => guard.canActivate(contextWithRole(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
