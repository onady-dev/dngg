import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { INVALID_CREDENTIALS_MESSAGE, UserService } from './user.service';
import { User } from '../../entities/User.entity';
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
