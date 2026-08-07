import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { INVALID_CREDENTIALS_MESSAGE, UserService } from './user.service';
import { User } from '../../entities/User.entity';
import { Group } from '../../entities/Group.entity';
import { GroupRepository } from '../../repository/group.repository';
import { EmailVerificationService } from './email-verification.service';

const PASSWORD = 'password123';
let hashedPassword: string;

// 실제 bcrypt 해시로 검증한다. 라운드는 테스트 속도를 위해 4로 낮춘다
// (compare는 해시에 박힌 라운드를 읽으므로 검증에는 영향이 없다).
beforeAll(async () => {
  hashedPassword = await bcrypt.hash(PASSWORD, 4);
});

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 1,
    groupId: 10,
    email: 'captain@dngg.one',
    password: hashedPassword,
    name: '홍길동',
    createdAt: new Date(),
    role: 'user',
    ...overrides,
  }) as User;

const buildService = (
  options: {
    userFindOne?: jest.Mock;
    userFind?: jest.Mock;
    findByName?: jest.Mock;
  } = {},
) => {
  const userRepository = {
    findOne: options.userFindOne ?? jest.fn().mockResolvedValue(null),
    find: options.userFind ?? jest.fn().mockResolvedValue([]),
  };
  const groupRepository = {
    findByName: options.findByName ?? jest.fn().mockResolvedValue(null),
  };
  const jwtService = { sign: jest.fn().mockReturnValue('signed-token') };
  const service = new UserService(
    userRepository as unknown as Repository<User>,
    groupRepository as unknown as GroupRepository,
    {} as unknown as DataSource,
    jwtService as unknown as JwtService,
    {} as unknown as EmailVerificationService,
  );
  return { service, userRepository, groupRepository, jwtService };
};

describe('loginUser — 이메일 로그인', () => {
  test('이메일과 비밀번호가 맞으면 토큰과 비밀번호 없는 유저를 돌려준다', async () => {
    const user = makeUser();
    const { service, jwtService } = buildService({
      userFindOne: jest.fn().mockResolvedValue(user),
    });

    const result = await service.loginUser('captain@dngg.one', PASSWORD);

    expect(result.accessToken).toBe('signed-token');
    expect(jwtService.sign).toHaveBeenCalledWith({
      userId: 1,
      email: 'captain@dngg.one',
      groupId: 10,
      role: 'user',
    });
    expect(result.user).not.toHaveProperty('password');
  });

  test('앞뒤 공백은 제거하고 조회한다', async () => {
    const userFindOne = jest.fn().mockResolvedValue(makeUser());
    const { service } = buildService({ userFindOne });

    await service.loginUser('  captain@dngg.one  ', PASSWORD);

    expect(userFindOne).toHaveBeenCalledWith({
      where: { email: 'captain@dngg.one' },
    });
  });

  test('이메일 조회가 성공하면 그룹명 조회는 시도하지 않는다', async () => {
    const findByName = jest.fn().mockResolvedValue(null);
    const { service } = buildService({
      userFindOne: jest.fn().mockResolvedValue(makeUser()),
      findByName,
    });

    await service.loginUser('captain@dngg.one', PASSWORD);

    expect(findByName).not.toHaveBeenCalled();
  });
});

describe('loginUser — 실패 응답', () => {
  test('없는 아이디는 401을 던진다', async () => {
    const { service } = buildService();

    await expect(
      service.loginUser('nobody@dngg.one', PASSWORD),
    ).rejects.toMatchObject({
      status: 401,
      message: INVALID_CREDENTIALS_MESSAGE,
    });
  });

  test('비밀번호가 틀리면 없는 아이디와 완전히 같은 응답을 준다', async () => {
    const { service } = buildService({
      userFindOne: jest.fn().mockResolvedValue(makeUser()),
    });

    await expect(
      service.loginUser('captain@dngg.one', 'wrong-password'),
    ).rejects.toMatchObject({
      status: 401,
      message: INVALID_CREDENTIALS_MESSAGE,
    });
  });
});

const makeGroup = (overrides: Partial<Group> = {}): Group =>
  ({
    id: 10,
    name: '월요농구',
    isDeleted: false,
    freeGamesUsed: 0,
    customerKey: null,
    ...overrides,
  }) as unknown as Group;

describe('loginUser — 그룹명 로그인', () => {
  // trim은 현재 findUserByIdentifier 진입 전에 한 번만 이뤄진다 — 리팩터로 trim이
  // 이메일 분기 안쪽으로 들어가면(이메일 경로만 trim) 이 케이스가 조용히 깨져야 한다.
  test('앞뒤 공백이 있는 그룹명도 trim되어 조회한다', async () => {
    const user = makeUser();
    const findByName = jest.fn().mockResolvedValue(makeGroup());
    const userFind = jest.fn().mockResolvedValue([user]);
    const { service } = buildService({ findByName, userFind });

    await service.loginUser('  월요농구  ', PASSWORD);

    expect(findByName).toHaveBeenCalledWith('월요농구');
  });

  test('그룹명으로 그 그룹의 계정에 로그인한다', async () => {
    const user = makeUser();
    const findByName = jest.fn().mockResolvedValue(makeGroup());
    const userFind = jest.fn().mockResolvedValue([user]);
    const { service } = buildService({ findByName, userFind });

    const result = await service.loginUser('월요농구', PASSWORD);

    expect(findByName).toHaveBeenCalledWith('월요농구');
    expect(userFind).toHaveBeenCalledWith({
      where: { groupId: 10 },
      order: { id: 'ASC' },
      take: 2,
    });
    expect(result.accessToken).toBe('signed-token');
  });

  test('그룹명이면 이메일 조회를 시도하지 않는다', async () => {
    const userFindOne = jest.fn().mockResolvedValue(null);
    const findByName = jest.fn().mockResolvedValue(makeGroup());
    const userFind = jest.fn().mockResolvedValue([makeUser()]);
    const { service } = buildService({ userFindOne, findByName, userFind });

    await service.loginUser('월요농구', PASSWORD);

    expect(userFindOne).not.toHaveBeenCalled();
  });

  test('@가 들어간 그룹명은 이메일 조회 실패 후 그룹명으로 폴백한다', async () => {
    const userFindOne = jest.fn().mockResolvedValue(null);
    const findByName = jest
      .fn()
      .mockResolvedValue(makeGroup({ name: 'a@b.co' }));
    const userFind = jest.fn().mockResolvedValue([makeUser()]);
    const { service } = buildService({ userFindOne, findByName, userFind });

    const result = await service.loginUser('a@b.co', PASSWORD);

    expect(userFindOne).toHaveBeenCalledWith({ where: { email: 'a@b.co' } });
    expect(findByName).toHaveBeenCalledWith('a@b.co');
    expect(result.accessToken).toBe('signed-token');
  });

  // findByName은 isDeleted: false를 조건에 포함한다 — 삭제된 그룹은 null로 돌아온다.
  test('삭제됐거나 없는 그룹명은 401', async () => {
    const findByName = jest.fn().mockResolvedValue(null);
    const { service } = buildService({ findByName });

    await expect(service.loginUser('없는그룹', PASSWORD)).rejects.toMatchObject(
      {
        status: 401,
        message: INVALID_CREDENTIALS_MESSAGE,
      },
    );
    expect(findByName).toHaveBeenCalledWith('없는그룹');
  });

  test('그룹은 있는데 계정이 없으면 401', async () => {
    const findByName = jest.fn().mockResolvedValue(makeGroup());
    const userFind = jest.fn().mockResolvedValue([]);
    const { service } = buildService({ findByName, userFind });

    await expect(service.loginUser('월요농구', PASSWORD)).rejects.toMatchObject(
      {
        status: 401,
      },
    );
    expect(findByName).toHaveBeenCalledWith('월요농구');
    expect(userFind).toHaveBeenCalledWith({
      where: { groupId: 10 },
      order: { id: 'ASC' },
      take: 2,
    });
  });

  test('한 그룹에 계정이 2개 이상이면 로그인을 거부하고 에러 로그를 남긴다', async () => {
    const findByName = jest.fn().mockResolvedValue(makeGroup());
    const userFind = jest
      .fn()
      .mockResolvedValue([makeUser(), makeUser({ id: 2 })]);
    const { service } = buildService({ findByName, userFind });
    const errorLog = jest
      .spyOn(
        (service as unknown as { logger: { error: (m: string) => void } })
          .logger,
        'error',
      )
      .mockImplementation(() => undefined);

    await expect(service.loginUser('월요농구', PASSWORD)).rejects.toMatchObject(
      {
        status: 401,
      },
    );
    expect(errorLog).toHaveBeenCalled();
  });
});
