import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from './user.request.dto';

// Group.name이 varchar(20)이므로 DTO에서 먼저 걸러야 DB 500이 나지 않는다.
const baseDto = {
  email: 'user@example.com',
  password: 'password123',
  name: '홍길동',
  verificationToken: 'token',
};

describe('CreateUserDto groupName 검증', () => {
  test('20자를 초과하는 groupName은 검증에 실패한다', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...baseDto,
      groupName: 'a'.repeat(21),
    });

    const errors = await validate(dto);

    const groupNameError = errors.find((e) => e.property === 'groupName');
    expect(groupNameError).toBeDefined();
  });

  test('20자 이하의 groupName은 통과한다', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...baseDto,
      groupName: 'a'.repeat(20),
    });

    const errors = await validate(dto);

    expect(errors.find((e) => e.property === 'groupName')).toBeUndefined();
  });

  test('빈 groupName은 검증에 실패한다', async () => {
    const dto = plainToInstance(CreateUserDto, { ...baseDto, groupName: '' });

    const errors = await validate(dto);

    expect(errors.find((e) => e.property === 'groupName')).toBeDefined();
  });

  // 그룹명은 로그인 아이디이기도 하다. 앞뒤 공백이 섞인 채로 저장되면 화면에는
  // 공백 없이 보이는데 그 이름으로는 영영 로그인되지 않는다(로그인은 입력을 trim한다).
  test('앞뒤 공백은 제거되어 저장된다', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...baseDto,
      groupName: '  월요농구  ',
    });

    const errors = await validate(dto);

    expect(errors.find((e) => e.property === 'groupName')).toBeUndefined();
    expect(dto.groupName).toBe('월요농구');
  });

  test('공백뿐인 groupName은 검증에 실패한다', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...baseDto,
      groupName: '   ',
    });

    const errors = await validate(dto);

    expect(errors.find((e) => e.property === 'groupName')).toBeDefined();
  });

  // trim 후 20자를 넘지 않으면 통과해야 한다 — 공백까지 세면 길이 검증이 어긋난다.
  test('공백을 포함해 20자를 넘어도 trim 후 20자면 통과한다', async () => {
    const dto = plainToInstance(CreateUserDto, {
      ...baseDto,
      groupName: `  ${'a'.repeat(20)}  `,
    });

    const errors = await validate(dto);

    expect(errors.find((e) => e.property === 'groupName')).toBeUndefined();
    expect(dto.groupName).toBe('a'.repeat(20));
  });
});
