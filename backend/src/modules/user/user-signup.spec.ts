import { HttpException, HttpStatus } from '@nestjs/common';
import { UserService } from './user.service';

const makeQueryRunner = () => ({
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  manager: {
    create: jest.fn((_entity: any, v: any) => v),
    save: jest.fn((_entity: any, v: any) => Promise.resolve({ id: 1, ...v })),
  },
});

const baseDto = {
  email: 'a@b.c',
  password: 'password123',
  name: '홍길동',
  groupName: '테스트그룹',
  verificationToken: 'valid-token',
};

describe('createUser 이메일 인증 강제', () => {
  test('assertVerified가 거부하면 가입이 진행되지 않는다', async () => {
    const emailVerification = {
      assertVerified: jest
        .fn()
        .mockRejectedValue(
          new HttpException('invalid', HttpStatus.UNAUTHORIZED),
        ),
      markConsumed: jest.fn(),
    };
    const queryRunner = makeQueryRunner();
    const dataSource = { createQueryRunner: () => queryRunner };
    const service = new UserService(
      {} as any,
      {} as any,
      dataSource as any,
      {} as any,
      emailVerification as any,
    );

    await expect(service.createUser(baseDto as any)).rejects.toMatchObject({
      status: 401,
    });
    expect(queryRunner.startTransaction).not.toHaveBeenCalled();
  });

  test('토큰의 email과 dto.email이 다르면 401', async () => {
    const emailVerification = {
      assertVerified: jest
        .fn()
        .mockResolvedValue({ email: 'other@b.c', verificationId: 5 }),
      markConsumed: jest.fn(),
    };
    const dataSource = { createQueryRunner: () => makeQueryRunner() };
    const service = new UserService(
      {} as any,
      {} as any,
      dataSource as any,
      {} as any,
      emailVerification as any,
    );

    await expect(service.createUser(baseDto as any)).rejects.toMatchObject({
      status: 401,
    });
  });

  test('정상 토큰이면 가입하고 인증을 소비한다', async () => {
    const emailVerification = {
      assertVerified: jest
        .fn()
        .mockResolvedValue({ email: 'a@b.c', verificationId: 5 }),
      markConsumed: jest.fn(),
    };
    const queryRunner = makeQueryRunner();
    const dataSource = { createQueryRunner: () => queryRunner };
    const service = new UserService(
      {} as any,
      {} as any,
      dataSource as any,
      {} as any,
      emailVerification as any,
    );

    const user = await service.createUser(baseDto as any);

    expect(user.name).toBe('홍길동');
    expect((user as any).phoneNumber).toBeUndefined();
    expect(emailVerification.markConsumed).toHaveBeenCalledWith(
      5,
      queryRunner.manager,
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });
});
