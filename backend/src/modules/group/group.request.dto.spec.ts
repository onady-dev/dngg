import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PostGroupRequestDto } from './group.request.dto';

const validateName = async (name: unknown) => {
  const dto = plainToInstance(PostGroupRequestDto, { name });
  return { dto, errors: await validate(dto) };
};

// Group.name은 로그인 아이디이기도 하다. POST /group은 가입과 별개로 같은 컬럼에
// 쓰는 두 번째 경로이므로, 가입 DTO와 동일한 위생 규칙이 걸려 있어야 한다.
describe('PostGroupRequestDto name 검증', () => {
  test('앞뒤 공백은 제거되어 저장된다', async () => {
    const { dto, errors } = await validateName('  월요농구  ');

    expect(errors).toHaveLength(0);
    expect(dto.name).toBe('월요농구');
  });

  test('공백뿐인 이름은 검증에 실패한다', async () => {
    const { errors } = await validateName('   ');

    expect(errors.find((e) => e.property === 'name')).toBeDefined();
  });

  // Group.name 컬럼이 varchar(20)이라 검증 없이 넘어가면 DB에서 500이 난다.
  test('20자를 초과하는 이름은 검증에 실패한다', async () => {
    const { errors } = await validateName('a'.repeat(21));

    expect(errors.find((e) => e.property === 'name')).toBeDefined();
  });

  test('공백을 포함해 20자를 넘어도 trim 후 20자면 통과한다', async () => {
    const { dto, errors } = await validateName(`  ${'a'.repeat(20)}  `);

    expect(errors).toHaveLength(0);
    expect(dto.name).toBe('a'.repeat(20));
  });

  test('문자열이 아닌 이름은 검증에 실패한다', async () => {
    const { errors } = await validateName({ $ne: null });

    expect(errors.find((e) => e.property === 'name')).toBeDefined();
  });
});
