import { SendEmailCommand } from '@aws-sdk/client-ses';
import {
  assertMailConfigured,
  buildInquiryAnswerMail,
  buildVerificationMail,
  MailService,
} from './mail.service';

interface MailServiceInternals {
  logger: { warn: (message: string) => void };
  client: { send: jest.Mock } | null;
}

function internals(service: MailService): MailServiceInternals {
  return service as unknown as MailServiceInternals;
}

describe('MailService', () => {
  describe('assertMailConfigured', () => {
    test('prod이고 MAIL_FROM이 undefined면 던진다', () => {
      expect(() => assertMailConfigured('prod', undefined)).toThrow(
        'MAIL_FROM이 설정되지 않았습니다. 운영에서는 회신·인증 메일이 조용히 발송되지 않으므로 부팅을 중단합니다.',
      );
    });

    test('prod이고 MAIL_FROM이 빈 문자열이면 던진다', () => {
      expect(() => assertMailConfigured('prod', '')).toThrow(
        'MAIL_FROM이 설정되지 않았습니다. 운영에서는 회신·인증 메일이 조용히 발송되지 않으므로 부팅을 중단합니다.',
      );
    });

    test('prod이고 MAIL_FROM이 설정되어 있으면 던지지 않는다', () => {
      expect(() =>
        assertMailConfigured('prod', 'no-reply@dngg.one'),
      ).not.toThrow();
    });

    test('dev이고 MAIL_FROM이 없어도 던지지 않는다 (dev 폴백 유지)', () => {
      expect(() => assertMailConfigured('dev', undefined)).not.toThrow();
    });
  });

  describe('buildVerificationMail', () => {
    test('signup 템플릿에 코드가 포함된다', () => {
      const { subject, body } = buildVerificationMail('signup', '123456');
      expect(subject).toContain('회원가입');
      expect(body).toContain('123456');
    });

    test('password_reset 템플릿에 코드와 무시 안내가 포함된다', () => {
      const { subject, body } = buildVerificationMail(
        'password_reset',
        '654321',
      );
      expect(subject).toContain('비밀번호');
      expect(body).toContain('654321');
      expect(body).toContain('무시');
    });
  });

  describe('sendVerificationCode', () => {
    const originalMailFrom = process.env.MAIL_FROM;
    afterEach(() => {
      process.env.MAIL_FROM = originalMailFrom;
    });

    test('MAIL_FROM 미설정이면 SES 호출 없이 코드를 로그로 남긴다 (dev 폴백)', async () => {
      delete process.env.MAIL_FROM;
      const service = new MailService();
      const warnSpy = jest
        .spyOn(internals(service).logger, 'warn')
        .mockImplementation(() => undefined);

      await service.sendVerificationCode('a@b.c', '123456', 'signup');

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('123456'));
      expect(internals(service).client).toBeNull();
    });

    test('MAIL_FROM 설정 시 SES로 올바른 파라미터의 SendEmailCommand를 보낸다', async () => {
      process.env.MAIL_FROM = 'no-reply@dngg.one';
      const service = new MailService();
      const send = jest.fn((command: SendEmailCommand) => {
        void command;
        return Promise.resolve({});
      });
      internals(service).client = { send };

      await service.sendVerificationCode('a@b.c', '123456', 'signup');

      expect(send).toHaveBeenCalledTimes(1);
      const command = send.mock.calls[0][0];
      expect(command.input).toEqual({
        Source: 'no-reply@dngg.one',
        Destination: { ToAddresses: ['a@b.c'] },
        Message: {
          Subject: { Data: '[dn.gg] 회원가입 인증 코드', Charset: 'UTF-8' },
          Body: {
            Text: {
              Data: 'dn.gg 회원가입 인증 코드는 123456 입니다.\n10분 안에 입력해주세요.',
              Charset: 'UTF-8',
            },
          },
        },
      });
    });
  });

  describe('buildInquiryAnswerMail', () => {
    test('제목이 고정 문구이고 본문에 유형 라벨·원문·답변이 모두 들어간다', () => {
      const { subject, body } = buildInquiryAnswerMail(
        'bug',
        '기록 화면 버튼이 가려집니다.',
        '다음 배포에서 수정하겠습니다.',
      );
      expect(subject).toBe('[dn.gg] 문의하신 내용에 답변드립니다');
      expect(body).toContain('버그 신고');
      expect(body).toContain('기록 화면 버튼이 가려집니다.');
      expect(body).toContain('다음 배포에서 수정하겠습니다.');
    });

    test('유형별 한글 라벨이 반영된다', () => {
      expect(buildInquiryAnswerMail('feature', 'c', 'a').body).toContain(
        '기능 제안',
      );
      expect(buildInquiryAnswerMail('billing', 'c', 'a').body).toContain(
        '결제·구독',
      );
      expect(buildInquiryAnswerMail('etc', 'c', 'a').body).toContain('기타');
    });
  });

  describe('sendInquiryAnswer', () => {
    const originalMailFrom = process.env.MAIL_FROM;
    afterEach(() => {
      process.env.MAIL_FROM = originalMailFrom;
    });

    test('MAIL_FROM 설정 시 작성자 주소로 회신 메일을 보낸다', async () => {
      process.env.MAIL_FROM = 'no-reply@dngg.one';
      const service = new MailService();
      const send = jest.fn((command: SendEmailCommand) => {
        void command;
        return Promise.resolve({});
      });
      internals(service).client = { send };

      await service.sendInquiryAnswer('who@example.com', 'bug', '원문', '답변');

      expect(send).toHaveBeenCalledTimes(1);
      const command = send.mock.calls[0][0];
      // tsconfig가 strictNullChecks: true라 SendEmailCommandInput의 옵셔널
      // 프로퍼티는 반드시 옵셔널 체이닝으로 읽는다 (ts-jest가 타입 에러로 실패시킴).
      expect(command.input.Destination).toEqual({
        ToAddresses: ['who@example.com'],
      });
      expect(command.input.Message?.Subject?.Data).toBe(
        '[dn.gg] 문의하신 내용에 답변드립니다',
      );
      expect(command.input.Message?.Body?.Text?.Data).toContain('답변');
    });

    test('SES 호출이 실패하면 에러를 그대로 전파한다 (조용히 삼키지 않는다)', async () => {
      process.env.MAIL_FROM = 'no-reply@dngg.one';
      const service = new MailService();
      internals(service).client = {
        send: jest.fn().mockRejectedValue(new Error('SES down')),
      };

      await expect(
        service.sendInquiryAnswer('who@example.com', 'bug', '원문', '답변'),
      ).rejects.toThrow('SES down');
    });

    test('MAIL_FROM 미설정이면 SES 호출 없이 정상 반환한다 (dev 폴백)', async () => {
      delete process.env.MAIL_FROM;
      const service = new MailService();
      jest
        .spyOn(internals(service).logger, 'warn')
        .mockImplementation(() => undefined);

      await expect(
        service.sendInquiryAnswer('who@example.com', 'etc', '원문', '답변'),
      ).resolves.toBeUndefined();
      expect(internals(service).client).toBeNull();
    });
  });
});
