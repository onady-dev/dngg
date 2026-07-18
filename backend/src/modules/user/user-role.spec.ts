import * as bcrypt from 'bcrypt';
import { UserService } from './user.service';
import { JwtStrategy } from './jwt.strategy';
import { EmailVerificationService } from './email-verification.service';

describe('User role JWT 전파', () => {
  test('loginUser는 JWT payload에 role을 포함한다', async () => {
    const hashed = await bcrypt.hash('pw1234', 4);
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        email: 'admin@test.com',
        groupId: 7,
        role: 'admin',
        password: hashed,
      }),
    };
    const jwtService = { sign: jest.fn().mockReturnValue('signed-token') };
    const service = new UserService(
      userRepo as any,
      {} as any,
      {} as any,
      jwtService as any,
      {} as unknown as EmailVerificationService,
    );

    await service.loginUser('admin@test.com', 'pw1234');

    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin', groupId: 7 }),
    );
  });

  describe('JwtStrategy.validate', () => {
    beforeAll(() => {
      process.env.JWT_SECRET = 'test-secret';
    });

    test('payload의 role을 req.user로 전달한다', async () => {
      const strategy = new JwtStrategy();
      const result = await strategy.validate({
        userId: 1,
        email: 'a@b.c',
        groupId: 2,
        role: 'admin',
      });
      expect(result.role).toBe('admin');
    });

    test('role 없는 레거시 토큰은 user로 취급한다', async () => {
      const strategy = new JwtStrategy();
      const result = await strategy.validate({
        userId: 1,
        email: 'a@b.c',
        groupId: 2,
      });
      expect(result.role).toBe('user');
    });

    test('userId 없는 이메일 인증 토큰 payload는 거부한다', async () => {
      const strategy = new JwtStrategy();
      // 실제로는 EmailVerificationService.confirmCode가 발급하는
      // {email, purpose, verificationId} 형태(userId 없음) — 런타임 payload는
      // JwtPayload 타입으로 정적으로 보장되지 않으므로 테스트에서 캐스팅한다.
      const verificationShapedPayload = {
        email: 'a@b.c',
        purpose: 'signup',
        verificationId: 42,
      } as unknown as Parameters<typeof strategy.validate>[0];
      await expect(
        strategy.validate(verificationShapedPayload),
      ).rejects.toThrow('Invalid token');
    });

    test('userId가 있는 로그인 토큰 payload는 통과한다', async () => {
      const strategy = new JwtStrategy();
      const result = await strategy.validate({
        userId: 1,
        email: 'a@b.c',
        groupId: 2,
        role: 'admin',
      });
      expect(result.userId).toBe(1);
    });
  });
});
