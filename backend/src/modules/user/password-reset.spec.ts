import * as bcrypt from 'bcrypt';
import { UserService } from './user.service';

describe('resetPassword', () => {
  const makeService = (overrides?: {
    user?: any;
    assertVerified?: jest.Mock;
  }) => {
    const userRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue(
          overrides?.user !== undefined ? overrides.user : { id: 3, email: 'a@b.c' },
        ),
      update: jest.fn(),
    };
    const emailVerification = {
      assertVerified:
        overrides?.assertVerified ??
        jest.fn().mockResolvedValue({ email: 'a@b.c', verificationId: 9 }),
      markConsumed: jest.fn(),
    };
    const service = new UserService(
      userRepo as any,
      {} as any,
      {} as any,
      {} as any,
      emailVerification as any,
    );
    return { service, userRepo, emailVerification };
  };

  test('password_reset 인증 토큰으로 비밀번호를 bcrypt 해시로 교체한다', async () => {
    const { service, userRepo, emailVerification } = makeService();

    const result = await service.resetPassword('token', 'newpassword1');

    expect(emailVerification.assertVerified).toHaveBeenCalledWith(
      'token',
      'password_reset',
    );
    const [id, data] = userRepo.update.mock.calls[0];
    expect(id).toBe(3);
    expect(await bcrypt.compare('newpassword1', data.password)).toBe(true);
    expect(emailVerification.markConsumed).toHaveBeenCalledWith(9);
    expect(result.message).toBeDefined();
  });

  test('토큰의 이메일로 유저를 못 찾으면 404', async () => {
    const { service } = makeService({ user: null });
    await expect(service.resetPassword('token', 'newpassword1')).rejects.toMatchObject(
      { status: 404 },
    );
  });
});
