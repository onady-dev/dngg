import { HttpException, HttpStatus } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { UserService } from './user.service';
import { User } from '../../entities/User.entity';
import { GroupRepository } from '../../repository/group.repository';
import { EmailVerificationService } from './email-verification.service';
import { CreateUserDto } from './user.request.dto';

const makeQueryRunner = () => ({
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  manager: {
    create: jest.fn((_entity: unknown, v: Record<string, unknown>) => v),
    save: jest.fn((_entity: unknown, v: Record<string, unknown>) =>
      Promise.resolve({ id: 1, ...v }),
    ),
  },
});

const baseDto: CreateUserDto = {
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
      {} as unknown as Repository<User>,
      {} as unknown as GroupRepository,
      dataSource as unknown as DataSource,
      {} as unknown as JwtService,
      emailVerification as unknown as EmailVerificationService,
    );

    await expect(service.createUser(baseDto)).rejects.toMatchObject({
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
      {} as unknown as Repository<User>,
      {} as unknown as GroupRepository,
      dataSource as unknown as DataSource,
      {} as unknown as JwtService,
      emailVerification as unknown as EmailVerificationService,
    );

    await expect(service.createUser(baseDto)).rejects.toMatchObject({
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
      {} as unknown as Repository<User>,
      {} as unknown as GroupRepository,
      dataSource as unknown as DataSource,
      {} as unknown as JwtService,
      emailVerification as unknown as EmailVerificationService,
    );

    const user = await service.createUser(baseDto);

    expect(user.name).toBe('홍길동');
    expect(
      (user as unknown as Record<string, unknown>).phoneNumber,
    ).toBeUndefined();
    expect(emailVerification.markConsumed).toHaveBeenCalledWith(
      5,
      queryRunner.manager,
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });
});

// 유니크 위반(23505)이 500이 아닌 400으로 변환되는지 고정하는 회귀 테스트.
describe('createUser 유니크 위반 처리', () => {
  const makeService = (queryRunner: ReturnType<typeof makeQueryRunner>) => {
    const emailVerification = {
      assertVerified: jest
        .fn()
        .mockResolvedValue({ email: 'a@b.c', verificationId: 5 }),
      markConsumed: jest.fn(),
    };
    const dataSource = { createQueryRunner: () => queryRunner };
    return new UserService(
      {} as unknown as Repository<User>,
      {} as unknown as GroupRepository,
      dataSource as unknown as DataSource,
      {} as unknown as JwtService,
      emailVerification as unknown as EmailVerificationService,
    );
  };

  test('중복 그룹명이면 400 Group name already exists', async () => {
    const queryRunner = makeQueryRunner();
    queryRunner.manager.save = jest.fn().mockRejectedValue(
      Object.assign(new Error('duplicate key'), {
        code: '23505',
        table: 'group',
      }),
    );
    const service = makeService(queryRunner);

    await expect(service.createUser(baseDto)).rejects.toMatchObject({
      status: 400,
      message: 'Group name already exists',
    });
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });

  test('중복 이메일이면 400 Email already exists', async () => {
    const queryRunner = makeQueryRunner();
    queryRunner.manager.save = jest
      .fn()
      // 첫 save(Group)는 성공, 두 번째 save(User)에서 이메일 유니크 위반
      .mockResolvedValueOnce({ id: 1 })
      .mockRejectedValueOnce(
        Object.assign(new Error('duplicate key'), {
          code: '23505',
          table: 'user',
        }),
      );
    const service = makeService(queryRunner);

    await expect(service.createUser(baseDto)).rejects.toMatchObject({
      status: 400,
      message: 'Email already exists',
    });
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });
});
