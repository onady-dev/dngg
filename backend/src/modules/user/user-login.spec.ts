import * as bcrypt from 'bcrypt';
import { DataSource, Not, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { INVALID_CREDENTIALS_MESSAGE, UserService } from './user.service';
import { User } from '../../entities/User.entity';
import { Group } from '../../entities/Group.entity';
import { GroupRepository } from '../../repository/group.repository';
import { EmailVerificationService } from './email-verification.service';
import { ADMIN_ROLE } from '../admin/admin.constants';

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
      where: { groupId: 10, role: Not(ADMIN_ROLE) },
      order: { id: 'ASC' },
      take: 2,
    });
    expect(result.accessToken).toBe('signed-token');
  });

  // 이 테스트는 원래 "그룹명이면 이메일 조회를 시도하지 않는다"였다. 그 동작이
  // 2026-08-07 운영 장애의 원인이었다 — 비이메일 아이디를 쓰는 레거시 계정이
  // 조회조차 되지 않았다. 계정 조회를 항상 먼저 하는 것이 올바른 계약이다.
  test('그룹명이어도 계정 조회를 먼저 하고, 없을 때 그룹으로 넘어간다', async () => {
    const userFindOne = jest.fn().mockResolvedValue(null);
    const findByName = jest.fn().mockResolvedValue(makeGroup());
    const userFind = jest.fn().mockResolvedValue([makeUser()]);
    const { service } = buildService({ userFindOne, findByName, userFind });

    await service.loginUser('월요농구', PASSWORD);

    expect(userFindOne).toHaveBeenCalledWith({ where: { email: '월요농구' } });
    expect(findByName).toHaveBeenCalledWith('월요농구');
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
      where: { groupId: 10, role: Not(ADMIN_ROLE) },
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

// 운영 회귀(2026-08-07): User.email 컬럼에 이메일이 아니라 아이디가 들어 있는
// 레거시 계정이 다수 있다(11개 중 8개). 이메일 형식일 때만 email 컬럼을 조회하면
// 그 계정들은 조회조차 되지 않고 그룹명 경로로 빠져 전부 로그인 불가가 된다.
describe('loginUser — 이메일 형식이 아닌 레거시 아이디', () => {
  test('이메일 형식이 아니어도 email 컬럼을 조회해 로그인된다', async () => {
    const user = makeUser({ email: 'onady' });
    const userFindOne = jest.fn().mockResolvedValue(user);
    const findByName = jest.fn().mockResolvedValue(null);
    const { service } = buildService({ userFindOne, findByName });

    const result = await service.loginUser('onady', PASSWORD);

    expect(userFindOne).toHaveBeenCalledWith({ where: { email: 'onady' } });
    expect(result.accessToken).toBe('signed-token');
    expect(findByName).not.toHaveBeenCalled();
  });

  // 스내치 계정이 잠긴 실제 경로: 아이디가 그룹명과 같고 그 그룹에 계정이 2개라
  // 그룹명 가드에 걸려 거부됐다. 계정 조회가 먼저이므로 가드까지 가면 안 된다.
  test('아이디가 그룹명과 같아도 계정 조회가 먼저다', async () => {
    const user = makeUser({ email: '스내치', groupId: 1 });
    const userFindOne = jest.fn().mockResolvedValue(user);
    const findByName = jest
      .fn()
      .mockResolvedValue(makeGroup({ id: 1, name: '스내치' }));
    const userFind = jest
      .fn()
      .mockResolvedValue([
        user,
        makeUser({ id: 12, email: 'onady', groupId: 1 }),
      ]);
    const { service } = buildService({ userFindOne, findByName, userFind });

    const result = await service.loginUser('스내치', PASSWORD);

    expect(result.accessToken).toBe('signed-token');
    expect(findByName).not.toHaveBeenCalled();
  });

  test('일치하는 계정이 없을 때만 그룹명으로 넘어간다', async () => {
    const userFindOne = jest.fn().mockResolvedValue(null);
    const findByName = jest.fn().mockResolvedValue(makeGroup());
    const userFind = jest.fn().mockResolvedValue([makeUser()]);
    const { service } = buildService({ userFindOne, findByName, userFind });

    const result = await service.loginUser('월요농구', PASSWORD);

    expect(userFindOne).toHaveBeenCalledWith({ where: { email: '월요농구' } });
    expect(findByName).toHaveBeenCalledWith('월요농구');
    expect(result.accessToken).toBe('signed-token');
  });
});

// admin은 플랫폼 전체 관리 계정이라 어느 그룹엔가 소속되어 있을 뿐,
// 그 그룹의 계정이 아니다. 운영의 그룹 1(스내치)이 이 경우다 —
// 주인 계정(id=1)과 admin 계정(onady)이 같은 그룹에 있어 "계정 2개" 가드에
// 걸려 그룹명 로그인이 막혀 있었다.
describe('loginUser — 그룹명 조회는 admin 계정을 세지 않는다', () => {
  test('그룹에 admin이 같이 있어도 주인 계정으로 로그인된다', async () => {
    const findByName = jest
      .fn()
      .mockResolvedValue(makeGroup({ id: 1, name: '스내치' }));
    const userFind = jest
      .fn()
      .mockResolvedValue([makeUser({ id: 1, groupId: 1 })]);
    const { service } = buildService({ findByName, userFind });

    const result = await service.loginUser('스내치', PASSWORD);

    // admin 제외가 조회 조건에 실려야 한다 — 조회 후 필터링이면
    // take: 2에 admin이 먼저 잡혀 주인 계정이 밀려날 수 있다.
    expect(userFind).toHaveBeenCalledWith({
      where: { groupId: 1, role: Not(ADMIN_ROLE) },
      order: { id: 'ASC' },
      take: 2,
    });
    expect(result.accessToken).toBe('signed-token');
  });

  test('admin이 아닌 계정이 2개면 여전히 거부한다', async () => {
    const findByName = jest.fn().mockResolvedValue(makeGroup());
    const userFind = jest
      .fn()
      .mockResolvedValue([makeUser(), makeUser({ id: 2 })]);
    const { service } = buildService({ findByName, userFind });

    await expect(service.loginUser('월요농구', PASSWORD)).rejects.toMatchObject(
      {
        status: 401,
      },
    );
  });

  // admin만 있는 그룹은 그룹명으로 로그인되지 않는다(닫히는 쪽으로 실패).
  // 해당 admin은 자기 아이디로 로그인하면 된다.
  test('admin만 있는 그룹은 그룹명으로 로그인되지 않는다', async () => {
    const findByName = jest.fn().mockResolvedValue(makeGroup());
    const userFind = jest.fn().mockResolvedValue([]);
    const { service } = buildService({ findByName, userFind });

    await expect(service.loginUser('월요농구', PASSWORD)).rejects.toMatchObject(
      {
        status: 401,
      },
    );
  });
});
