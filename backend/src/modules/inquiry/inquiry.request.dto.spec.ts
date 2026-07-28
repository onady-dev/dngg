import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  AnswerInquiryDto,
  CreateInquiryDto,
  ListInquiryQueryDto,
} from './inquiry.request.dto';

describe('CreateInquiryDto', () => {
  test('허용된 type과 내용이 있으면 통과한다', async () => {
    const dto = plainToInstance(CreateInquiryDto, {
      type: 'bug',
      content: '기록 화면에서 버튼이 가려집니다.',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  test('허용되지 않은 type은 거부한다', async () => {
    const dto = plainToInstance(CreateInquiryDto, {
      type: 'spam',
      content: '내용',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  test('빈 content는 거부한다', async () => {
    const dto = plainToInstance(CreateInquiryDto, { type: 'etc', content: '' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'content')).toBe(true);
  });

  test('2000자를 넘는 content는 거부한다', async () => {
    const dto = plainToInstance(CreateInquiryDto, {
      type: 'etc',
      content: 'a'.repeat(2001),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'content')).toBe(true);
  });

  test('2000자 content는 통과한다 (경계값)', async () => {
    const dto = plainToInstance(CreateInquiryDto, {
      type: 'etc',
      content: 'a'.repeat(2000),
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});

describe('AnswerInquiryDto', () => {
  test('빈 answer는 거부한다', async () => {
    const dto = plainToInstance(AnswerInquiryDto, { answer: '' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'answer')).toBe(true);
  });

  test('5000자를 넘는 answer는 거부한다', async () => {
    const dto = plainToInstance(AnswerInquiryDto, { answer: 'a'.repeat(5001) });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'answer')).toBe(true);
  });
});

describe('ListInquiryQueryDto', () => {
  test('status가 없어도 통과한다', async () => {
    const dto = plainToInstance(ListInquiryQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  test('허용된 status는 통과한다', async () => {
    const dto = plainToInstance(ListInquiryQueryDto, { status: 'pending' });
    expect(await validate(dto)).toHaveLength(0);
  });

  test('허용되지 않은 status는 거부한다', async () => {
    const dto = plainToInstance(ListInquiryQueryDto, { status: 'DROP TABLE' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });

  // 쿼리 파라미터는 항상 문자열로 도착한다. @Type이 없으면 숫자 검증이
  // 문자열 "2"에 걸려 정상 요청이 400으로 떨어진다.
  test('문자열로 온 page·limit을 숫자로 변환한다', async () => {
    const dto = plainToInstance(ListInquiryQueryDto, {
      page: '2',
      limit: '50',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
  });

  test('page·limit이 없어도 통과한다', async () => {
    const dto = plainToInstance(ListInquiryQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  test('0 이하의 page는 거부한다', async () => {
    const dto = plainToInstance(ListInquiryQueryDto, { page: '0' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  // 상한이 없으면 limit=999999로 페이지네이션을 통째로 우회할 수 있다.
  test('상한을 넘는 limit은 거부한다', async () => {
    const dto = plainToInstance(ListInquiryQueryDto, { limit: '101' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  test('소수점 page는 거부한다', async () => {
    const dto = plainToInstance(ListInquiryQueryDto, { page: '1.5' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });
});
