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

  // 둘 다 참조하는 ValidateIf 조건이 서로를 꺼버리면 identifier가 객체여도
  // 검증을 통과해버린다 — 그 회귀를 막는 케이스.
  test('identifier와 email이 둘 다 있고 identifier가 문자열이 아니면 실패한다', async () => {
    const errors = await validateBody({
      identifier: { a: 1 },
      email: 'x@y.z',
      password: 'pw12345678',
    });
    expect(errors.map((e) => e.property)).toContain('identifier');
  });

  test('identifier와 email이 둘 다 유효한 문자열이면 통과한다', async () => {
    expect(
      await validateBody({
        identifier: '월요농구',
        email: 'x@y.z',
        password: 'pw12345678',
      }),
    ).toHaveLength(0);
  });

  test('email만 있고 문자열이 아니면 실패한다', async () => {
    const errors = await validateBody({
      email: { a: 1 },
      password: 'pw12345678',
    });
    expect(errors.map((e) => e.property)).toContain('email');
  });
});
