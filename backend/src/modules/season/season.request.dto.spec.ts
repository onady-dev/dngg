import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PutCurrentSeasonRequestDto } from './season.request.dto';

describe('PutCurrentSeasonRequestDto 검증', () => {
  test('seasonId가 null이면 검증을 통과한다 (현재 시즌 해제)', async () => {
    const dto = plainToInstance(PutCurrentSeasonRequestDto, {
      groupId: 1,
      seasonId: null,
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toHaveLength(0);
  });

  test('seasonId가 숫자가 아니면 검증에 실패한다', async () => {
    const dto = plainToInstance(PutCurrentSeasonRequestDto, {
      groupId: 1,
      seasonId: 'abc',
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((error) => error.property === 'seasonId')).toBe(true);
  });
});
