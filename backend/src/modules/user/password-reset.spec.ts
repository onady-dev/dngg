import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { UserService } from './user.service';
import { User } from '../../entities/User.entity';
import { GroupRepository } from '../../repository/group.repository';
import { EmailVerificationService } from './email-verification.service';

const typedBcrypt = bcrypt as unknown as {
  compare: (data: string, encrypted: string) => Promise<boolean>;
};

const makeQueryRunner = () => ({
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  manager: {
    update: jest.fn(
      (_entity: unknown, _id: number, data: Record<string, unknown>) =>
        Promise.resolve({ ...data }),
    ),
  },
});

describe('resetPassword', () => {
  const makeService = (overrides?: {
    user?: { id: number; email: string } | null;
    assertVerified?: jest.Mock;
    queryRunner?: ReturnType<typeof makeQueryRunner>;
    emailVerification?: { assertVerified: jest.Mock; markConsumed: jest.Mock };
  }) => {
    const userRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue(
          overrides?.user !== undefined
            ? overrides.user
            : { id: 3, email: 'a@b.c' },
        ),
    };
    const emailVerification = overrides?.emailVerification ?? {
      assertVerified:
        overrides?.assertVerified ??
        jest.fn().mockResolvedValue({ email: 'a@b.c', verificationId: 9 }),
      markConsumed: jest.fn().mockResolvedValue(undefined),
    };
    const queryRunner = overrides?.queryRunner ?? makeQueryRunner();
    const dataSource = { createQueryRunner: () => queryRunner };
    const service = new UserService(
      userRepo as unknown as Repository<User>,
      {} as unknown as GroupRepository,
      dataSource as unknown as DataSource,
      {} as unknown as JwtService,
      emailVerification as unknown as EmailVerificationService,
    );
    return { service, userRepo, emailVerification, queryRunner };
  };

  test('password_reset 인증 토큰으로 비밀번호를 bcrypt 해시로 교체하고 트랜잭션을 커밋한다', async () => {
    const { service, emailVerification, queryRunner } = makeService();

    const result = await service.resetPassword('token', 'newpassword1');

    expect(emailVerification.assertVerified).toHaveBeenCalledWith(
      'token',
      'password_reset',
    );
    expect(queryRunner.connect).toHaveBeenCalled();
    expect(queryRunner.startTransaction).toHaveBeenCalled();
    const [, id, data] = queryRunner.manager.update.mock.calls[0];
    expect(id).toBe(3);
    expect(
      await typedBcrypt.compare('newpassword1', data.password as string),
    ).toBe(true);
    expect(emailVerification.markConsumed).toHaveBeenCalledWith(
      9,
      queryRunner.manager,
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
    expect(result.message).toBeDefined();
  });

  test('토큰의 이메일로 유저를 못 찾으면 404이고 트랜잭션을 열지 않는다', async () => {
    const { service, queryRunner } = makeService({ user: null });
    await expect(
      service.resetPassword('token', 'newpassword1'),
    ).rejects.toMatchObject({ status: 404 });
    expect(queryRunner.connect).not.toHaveBeenCalled();
  });

  test('markConsumed가 실패하면 비밀번호 업데이트를 롤백하고 인증은 소비되지 않는다', async () => {
    const queryRunner = makeQueryRunner();
    const emailVerification = {
      assertVerified: jest
        .fn()
        .mockResolvedValue({ email: 'a@b.c', verificationId: 9 }),
      markConsumed: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const { service } = makeService({ queryRunner, emailVerification });

    await expect(
      service.resetPassword('token', 'newpassword1'),
    ).rejects.toThrow('db down');

    expect(queryRunner.manager.update).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });

  test('rollbackTransaction 자체가 실패해도 원래 에러가 마스킹되지 않는다', async () => {
    const queryRunner = makeQueryRunner();
    queryRunner.rollbackTransaction = jest
      .fn()
      .mockRejectedValue(new Error('rollback failed'));
    const emailVerification = {
      assertVerified: jest
        .fn()
        .mockResolvedValue({ email: 'a@b.c', verificationId: 9 }),
      markConsumed: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const { service } = makeService({ queryRunner, emailVerification });

    await expect(
      service.resetPassword('token', 'newpassword1'),
    ).rejects.toThrow('db down');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });
});
