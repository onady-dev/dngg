import { NotFoundException } from '@nestjs/common';
import { InquiryService } from './inquiry.service';

const NOW = new Date('2026-07-28T09:00:00.000Z');
const AUTHOR = { userId: 42, email: 'writer@example.com' };

const makeService = (opts: { inquiry?: any; mailError?: Error } = {}) => {
  const inquiryRepo = {
    create: jest.fn((obj: any) => obj),
    save: jest.fn(async (obj: any) => ({
      id: 11,
      createdAt: NOW,
      ...obj,
    })),
    find: jest.fn(async () => []),
  };

  const manager = {
    findOne: jest.fn(async () => opts.inquiry ?? null),
    update: jest.fn(async () => ({ affected: 1 })),
  };

  // 콜백이 던지면 커밋되지 않는다 = 롤백. 실제 TypeORM 트랜잭션과 같은 계약.
  const committed = { value: false };
  const dataSource = {
    transaction: jest.fn(async (cb: any) => {
      const result = await cb(manager);
      committed.value = true;
      return result;
    }),
  };

  const mailService = {
    sendInquiryAnswer: jest.fn(async () => {
      if (opts.mailError) throw opts.mailError;
    }),
  };

  const service = new InquiryService(
    inquiryRepo as any,
    mailService as any,
    dataSource as any,
  );
  return { service, inquiryRepo, manager, mailService, committed };
};

describe('InquiryService.create', () => {
  test('authorEmail·userId를 req.user에서 채운다', async () => {
    const { service, inquiryRepo } = makeService();

    await service.create(AUTHOR, { type: 'bug', content: '버튼이 가려져요' });

    expect(inquiryRepo.create).toHaveBeenCalledWith({
      userId: 42,
      authorEmail: 'writer@example.com',
      type: 'bug',
      content: '버튼이 가려져요',
      status: 'pending',
    });
  });

  test('id와 createdAt만 돌려준다 (작성자 정보 에코백 없음)', async () => {
    const { service } = makeService();

    const result = await service.create(AUTHOR, {
      type: 'etc',
      content: '내용',
    });

    expect(result).toEqual({ id: 11, createdAt: NOW });
  });
});

describe('InquiryService.list', () => {
  test('status가 없으면 전체를 최신순으로 조회한다', async () => {
    const { service, inquiryRepo } = makeService();

    await service.list();

    expect(inquiryRepo.find).toHaveBeenCalledWith({
      where: {},
      order: { createdAt: 'DESC' },
    });
  });

  test('status가 있으면 필터를 건다', async () => {
    const { service, inquiryRepo } = makeService();

    await service.list('pending');

    expect(inquiryRepo.find).toHaveBeenCalledWith({
      where: { status: 'pending' },
      order: { createdAt: 'DESC' },
    });
  });
});

describe('InquiryService.answer', () => {
  const pendingInquiry = {
    id: 5,
    userId: 42,
    authorEmail: 'writer@example.com',
    type: 'bug',
    content: '버튼이 가려져요',
    status: 'pending',
    answer: null,
    answeredAt: null,
  };

  test('성공 시 answered로 갱신하고 메일을 1회 발송한다', async () => {
    const { service, manager, mailService, committed } = makeService({
      inquiry: pendingInquiry,
    });

    const result = await service.answer(5, { answer: '수정하겠습니다' }, NOW);

    expect(manager.update).toHaveBeenCalledWith(expect.anything(), 5, {
      answer: '수정하겠습니다',
      answeredAt: NOW,
      status: 'answered',
    });
    expect(mailService.sendInquiryAnswer).toHaveBeenCalledTimes(1);
    expect(mailService.sendInquiryAnswer).toHaveBeenCalledWith(
      'writer@example.com',
      'bug',
      '버튼이 가려져요',
      '수정하겠습니다',
    );
    expect(committed.value).toBe(true);
    expect(result).toEqual({ id: 5, status: 'answered', answeredAt: NOW });
  });

  // 핵심 케이스 — 불변식: status==='answered'이면 메일이 실제로 나갔다.
  test('메일 발송이 실패하면 롤백되어 pending으로 남는다', async () => {
    const { service, manager, committed } = makeService({
      inquiry: pendingInquiry,
      mailError: new Error('SES down'),
    });

    await expect(
      service.answer(5, { answer: '수정하겠습니다' }, NOW),
    ).rejects.toThrow('SES down');

    // UPDATE는 호출됐지만 커밋되지 않았다 = 롤백되어 status는 pending
    expect(manager.update).toHaveBeenCalled();
    expect(committed.value).toBe(false);
  });

  test('존재하지 않는 id면 NotFoundException이고 메일을 보내지 않는다', async () => {
    const { service, mailService, manager } = makeService();

    await expect(service.answer(999, { answer: 'a' }, NOW)).rejects.toThrow(
      NotFoundException,
    );
    expect(mailService.sendInquiryAnswer).not.toHaveBeenCalled();
    expect(manager.update).not.toHaveBeenCalled();
  });

  test('탈퇴해서 user가 null인 문의도 authorEmail로 발송한다', async () => {
    const { service, mailService } = makeService({
      inquiry: { ...pendingInquiry, userId: null, user: null },
    });

    await service.answer(5, { answer: '답변' }, NOW);

    expect(mailService.sendInquiryAnswer).toHaveBeenCalledWith(
      'writer@example.com',
      'bug',
      '버튼이 가려져요',
      '답변',
    );
  });

  test('이미 answered인 문의에 재답변하면 덮어쓰고 메일을 다시 보낸다', async () => {
    const LATER = new Date('2026-07-29T09:00:00.000Z');
    const { service, manager, mailService } = makeService({
      inquiry: {
        ...pendingInquiry,
        status: 'answered',
        answer: '이전 답변',
        answeredAt: NOW,
      },
    });

    await service.answer(5, { answer: '새 답변' }, LATER);

    expect(manager.update).toHaveBeenCalledWith(expect.anything(), 5, {
      answer: '새 답변',
      answeredAt: LATER,
      status: 'answered',
    });
    expect(mailService.sendInquiryAnswer).toHaveBeenCalledTimes(1);
  });
});
