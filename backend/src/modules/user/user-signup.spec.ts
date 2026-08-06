import { HttpException, HttpStatus } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { UserService } from './user.service';
import { User } from '../../entities/User.entity';
import { GroupRepository } from '../../repository/group.repository';
import { EmailVerificationService } from './email-verification.service';
import { CreateUserDto } from './user.request.dto';
import { Group } from '../../entities/Group.entity';
import { Logitem } from '../../entities/Logitem.entity';
import { DEFAULT_LOGITEMS } from '../logitem/logitem-seed';

const makeQueryRunner = () => ({
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  manager: {
    create: jest.fn((_entity: unknown, v: Record<string, unknown>) => v),
    save: jest.fn((_entity: unknown, v: unknown) =>
      Promise.resolve({ id: 1, ...(v as Record<string, unknown>) }),
    ),
    // 로그 항목 시드가 템플릿 그룹(0)을 조회한다 — 비어 있으면 기본 항목으로 폴백
    find: jest.fn().mockResolvedValue([]),
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

// 가입이 그룹을 만드는 유일한 실사용 경로다(프론트는 POST /group을 호출하지 않는다).
// 여기서 로그 항목을 시드하지 않으면 새 그룹은 기록 화면에 버튼이 하나도 없는 상태가 된다
// — 2026-08-06에 운영에서 3개 그룹이 이 상태로 만들어졌다.
describe('createUser 로그 항목 시드', () => {
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

  test('가입으로 만들어진 그룹에 로그 항목을 시드한다', async () => {
    const queryRunner = makeQueryRunner();
    const NEW_GROUP_ID = 77;
    queryRunner.manager.save = jest.fn((entity: unknown, v: unknown) => {
      // 첫 save는 Group — 새 그룹 id를 돌려준다
      if (entity === Group) return Promise.resolve({ id: NEW_GROUP_ID });
      return Promise.resolve({ id: 1, ...(v as Record<string, unknown>) });
    });

    await makeService(queryRunner).createUser(baseDto);

    const logitemSave = queryRunner.manager.save.mock.calls.find(
      ([entity]) => entity === Logitem,
    );
    expect(logitemSave).toBeDefined();
    const seeded = logitemSave![1] as Logitem[];
    expect(seeded).toHaveLength(DEFAULT_LOGITEMS.length);
    seeded.forEach((item) => expect(item.groupId).toBe(NEW_GROUP_ID));
  });

  test('시드는 가입 트랜잭션 안에서 일어난다 (커밋 전, 같은 manager)', async () => {
    const queryRunner = makeQueryRunner();
    const service = makeService(queryRunner);

    await service.createUser(baseDto);

    const logitemSaveOrder = queryRunner.manager.save.mock.calls.findIndex(
      ([entity]) => entity === Logitem,
    );
    expect(logitemSaveOrder).toBeGreaterThanOrEqual(0);
    // 시드 save가 commit보다 먼저여야 롤백 대상에 포함된다
    expect(
      queryRunner.manager.save.mock.invocationCallOrder[logitemSaveOrder],
    ).toBeLessThan(queryRunner.commitTransaction.mock.invocationCallOrder[0]);
  });

  test('시드가 실패하면 가입 전체가 롤백된다', async () => {
    const queryRunner = makeQueryRunner();
    queryRunner.manager.save = jest.fn((entity: unknown, v: unknown) => {
      if (entity === Logitem) return Promise.reject(new Error('시드 실패'));
      return Promise.resolve({ id: 1, ...(v as Record<string, unknown>) });
    });

    await expect(makeService(queryRunner).createUser(baseDto)).rejects.toThrow(
      '시드 실패',
    );
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
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
