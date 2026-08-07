import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { EmailVerificationService } from './email-verification.service';
import { LoginThrottlerGuard } from './login-throttler.guard';

const buildController = () => {
  const userService = {
    updateUser: jest.fn().mockResolvedValue({ id: 1 }),
    deleteUser: jest.fn().mockResolvedValue(undefined),
    loginUser: jest.fn().mockResolvedValue({ accessToken: 't' }),
  };
  const controller = new UserController(
    userService as unknown as UserService,
    {} as unknown as EmailVerificationService,
  );
  return { controller, userService };
};

describe('UserController 소유권 검증', () => {
  describe('updateUser', () => {
    test('본인 id면 수정을 허용한다', async () => {
      const { controller, userService } = buildController();
      const req = { user: { userId: 1 } };

      await controller.updateUser(req, 1, { name: '새이름' });

      expect(userService.updateUser).toHaveBeenCalledWith(1, {
        name: '새이름',
      });
    });

    test('타인 id면 403을 던지고 서비스를 호출하지 않는다', async () => {
      const { controller, userService } = buildController();
      const req = { user: { userId: 1 } };

      await expect(
        controller.updateUser(req, 2, { name: '해커' }),
      ).rejects.toThrow(ForbiddenException);
      expect(userService.updateUser).not.toHaveBeenCalled();
    });
  });

  describe('deleteUser', () => {
    test('본인 id면 삭제를 허용한다', async () => {
      const { controller, userService } = buildController();
      const req = { user: { userId: 1 } };

      await controller.deleteUser(req, 1);

      expect(userService.deleteUser).toHaveBeenCalledWith(1);
    });

    test('타인 id면 403을 던지고 서비스를 호출하지 않는다', async () => {
      const { controller, userService } = buildController();
      const req = { user: { userId: 1 } };

      await expect(controller.deleteUser(req, 2)).rejects.toThrow(
        ForbiddenException,
      );
      expect(userService.deleteUser).not.toHaveBeenCalled();
    });
  });
});

describe('loginUser', () => {
  test('identifier를 서비스에 그대로 넘긴다', async () => {
    const { controller, userService } = buildController();

    await controller.loginUser({
      identifier: '월요농구',
      password: 'pw12345678',
    });

    expect(userService.loginUser).toHaveBeenCalledWith(
      '월요농구',
      'pw12345678',
    );
  });

  // 캐시된 구버전 프론트 번들은 여전히 email 키로 보낸다.
  test('identifier가 없으면 레거시 email 키를 쓴다', async () => {
    const { controller, userService } = buildController();

    await controller.loginUser({ email: 'a@b.co', password: 'pw12345678' });

    expect(userService.loginUser).toHaveBeenCalledWith('a@b.co', 'pw12345678');
  });

  // @UseGuards(LoginThrottlerGuard)가 지워지면 로그인 rate limit이 통째로 사라지는데
  // 다른 테스트는 아무것도 실패하지 않는다(HTTP 계층 없이 컨트롤러 메서드를 직접 호출
  // 하므로 가드가 실제로 실행되지도 않는다) — 메타데이터로 가드 부착 자체를 못박는다.
  test('loginUser 핸들러에 LoginThrottlerGuard가 붙어 있다', () => {
    // 프로토타입을 Record<string, unknown>으로 받아 대괄호로 꺼내면 메서드를 함수
    // 타입으로 직접 참조하지 않아 unbound-method 린트에 걸리지 않는다. Reflect.
    // getMetadata의 반환 타입이 any라 결과는 unknown[]로 다시 캐스팅한다.
    const proto = UserController.prototype as unknown as Record<
      string,
      unknown
    >;
    const guards = (Reflect.getMetadata(
      '__guards__',
      proto['loginUser'] as object,
    ) ?? []) as unknown[];

    expect(guards).toContain(LoginThrottlerGuard);
  });
});
