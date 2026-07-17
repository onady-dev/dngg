import { buildVerificationMail, MailService } from './mail.service';

describe('MailService', () => {
  describe('buildVerificationMail', () => {
    test('signup 템플릿에 코드가 포함된다', () => {
      const { subject, body } = buildVerificationMail('signup', '123456');
      expect(subject).toContain('회원가입');
      expect(body).toContain('123456');
    });

    test('password_reset 템플릿에 코드와 무시 안내가 포함된다', () => {
      const { subject, body } = buildVerificationMail('password_reset', '654321');
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
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);

      await service.sendVerificationCode('a@b.c', '123456', 'signup');

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('123456'));
      expect((service as any).client).toBeNull();
    });
  });
});
