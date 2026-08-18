import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PutGameSeasonRequestDto } from './game.request.dto';

const check = async (payload: object) => {
  const dto = plainToInstance(PutGameSeasonRequestDto, payload);
  return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
};

describe('PutGameSeasonRequestDto', () => {
  test('seasonId가 null이어도 통과한다 (시즌 미지정으로 되돌리기)', async () => {
    const errors = await check({
      groupId: 1,
      gameIds: [10, 11],
      seasonId: null,
    });
    expect(errors).toHaveLength(0);
  });

  test('seasonId가 숫자면 통과한다', async () => {
    const errors = await check({ groupId: 1, gameIds: [10], seasonId: 7 });
    expect(errors).toHaveLength(0);
  });

  test('seasonId가 숫자가 아니면 실패한다', async () => {
    const errors = await check({ groupId: 1, gameIds: [10], seasonId: 'abc' });
    expect(errors.some((e) => e.property === 'seasonId')).toBe(true);
  });

  test('gameIds가 비어 있으면 실패한다', async () => {
    const errors = await check({ groupId: 1, gameIds: [], seasonId: 7 });
    expect(errors.some((e) => e.property === 'gameIds')).toBe(true);
  });

  test('gameIds가 500개를 넘으면 실패한다', async () => {
    const tooMany = Array.from({ length: 501 }, (_, i) => i + 1);
    const errors = await check({ groupId: 1, gameIds: tooMany, seasonId: 7 });
    expect(errors.some((e) => e.property === 'gameIds')).toBe(true);
  });

  test('선언되지 않은 프로퍼티가 있으면 실패한다', async () => {
    const errors = await check({
      groupId: 1,
      gameIds: [10],
      seasonId: 7,
      bogus: 1,
    });
    expect(errors.some((e) => e.property === 'bogus')).toBe(true);
  });
});
