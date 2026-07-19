import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GetLogByDailyRequestDto } from './log.request.dto';

describe('GetLogByDailyRequestDto', () => {
  test('YYYY-MM-DD 형식의 date는 통과한다', async () => {
    const dto = plainToInstance(GetLogByDailyRequestDto, {
      date: '2026-07-18',
      groupId: '1',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  test('날짜 형식이 아닌 date는 거부한다', async () => {
    const dto = plainToInstance(GetLogByDailyRequestDto, {
      date: 'foo',
      groupId: '1',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'date')).toBe(true);
  });
});
