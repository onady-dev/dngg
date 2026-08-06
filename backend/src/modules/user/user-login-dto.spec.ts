import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginUserDto } from './user.request.dto';

const validateBody = (body: Record<string, unknown>) =>
  validate(plainToInstance(LoginUserDto, body));

describe('LoginUserDto', () => {
  test('identifier + password면 통과한다', async () => {
    expect(
      await validateBody({ identifier: '월요농구', password: 'pw12345678' }),
    ).toHaveLength(0);
  });

  test('레거시 email + password면 통과한다', async () => {
    expect(
      await validateBody({ email: 'a@b.co', password: 'pw12345678' }),
    ).toHaveLength(0);
  });

  test('identifier와 email이 둘 다 없으면 실패한다', async () => {
    const errors = await validateBody({ password: 'pw12345678' });
    expect(errors.length).toBeGreaterThan(0);
  });

  test('password가 없으면 실패한다', async () => {
    const errors = await validateBody({ identifier: '월요농구' });
    expect(errors.map((e) => e.property)).toContain('password');
  });
});
