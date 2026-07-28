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
});
