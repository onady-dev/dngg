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
});
