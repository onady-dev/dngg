import { NotFoundException } from '@nestjs/common';
import { Inquiry } from 'src/entities/Inquiry.entity';
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

  // find가 항상 []을 반환하는 다른 list 테스트들은 .map()을 실행하지 않는다 —
  // 그 상태로는 `return rows;`처럼 user·userId·password를 그대로 흘리는
  // 버그도 통과한다. 실제 행을 흘려 넣어 화이트리스트 투영을 검증한다.
  test('InquiryAdminRow 화이트리스트만 반환한다 (user relation·userId 등 원본 필드는 제외)', async () => {
    const { service, inquiryRepo } = makeService();
    const rawRow = {
      id: 7,
      userId: 42,
      user: { id: 42, email: 'x@y.z', password: 'hash' },
      authorEmail: 'writer@example.com',
      type: 'bug',
      content: '버튼이 가려져요',
      status: 'pending',
      answer: null,
      answeredAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    inquiryRepo.find.mockResolvedValueOnce([rawRow] as any);

    const result = await service.list();

    expect(result).toEqual([
      {
        id: 7,
        type: 'bug',
        content: '버튼이 가려져요',
        authorEmail: 'writer@example.com',
        status: 'pending',
        answer: null,
        answeredAt: null,
        createdAt: NOW,
      },
    ]);
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

    expect(manager.update).toHaveBeenCalledWith(Inquiry, 5, {
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
    const { service, manager, mailService } = makeService({
      inquiry: { ...pendingInquiry, userId: null, user: null },
    });

    await service.answer(5, { answer: '답변' }, NOW);

    expect(mailService.sendInquiryAnswer).toHaveBeenCalledWith(
      'writer@example.com',
      'bug',
      '버튼이 가려져요',
      '답변',
    );
    // 구속 조건: relations 옵션 없이 조회한다 — user relation 로딩에 의존하지
    // 않아야 탈퇴로 user가 null이어도(또는 relation 로딩이 실패해도) 발송 경로가
    // 살아있다. relations: ['user']를 넣는 구현도 이 위의 assertion만으로는
    // 걸러지지 않으므로 여기서 findOne 호출 인자 자체를 검증한다.
    expect(manager.findOne).toHaveBeenCalledWith(Inquiry, {
      where: { id: 5 },
    });
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

    expect(manager.update).toHaveBeenCalledWith(Inquiry, 5, {
      answer: '새 답변',
      answeredAt: LATER,
      status: 'answered',
    });
    expect(mailService.sendInquiryAnswer).toHaveBeenCalledTimes(1);
  });
});
