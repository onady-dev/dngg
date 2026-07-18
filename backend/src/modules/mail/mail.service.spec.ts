import { SendEmailCommand } from '@aws-sdk/client-ses';
import { buildVerificationMail, MailService } from './mail.service';

interface MailServiceInternals {
  logger: { warn: (message: string) => void };
  client: { send: jest.Mock } | null;
}

function internals(service: MailService): MailServiceInternals {
  return service as unknown as MailServiceInternals;
}

describe('MailService', () => {
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
});
