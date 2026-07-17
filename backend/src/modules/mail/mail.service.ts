import { Injectable, Logger } from '@nestjs/common';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { VerificationPurpose } from '../user/email-verification.constants';

export function buildVerificationMail(
  purpose: VerificationPurpose,
  code: string,
): { subject: string; body: string } {
  if (purpose === 'signup') {
    return {
      subject: '[dn.gg] 회원가입 인증 코드',
      body: `dn.gg 회원가입 인증 코드는 ${code} 입니다.\n10분 안에 입력해주세요.`,
    };
  }
  return {
    subject: '[dn.gg] 비밀번호 재설정 인증 코드',
    body: `dn.gg 비밀번호 재설정 인증 코드는 ${code} 입니다.\n10분 안에 입력해주세요.\n본인이 요청하지 않았다면 이 메일을 무시하세요.`,
  };
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private client: SESClient | null = null;

  async sendVerificationCode(
    email: string,
    code: string,
    purpose: VerificationPurpose,
  ): Promise<void> {
    const from = process.env.MAIL_FROM;
    if (!from) {
      // dev 폴백 — SES 미설정 환경에서는 실발송 대신 코드를 로그로 출력
      this.logger.warn(`[dev] ${email} ${purpose} 인증 코드: ${code}`);
      return;
    }
    if (!this.client) {
      this.client = new SESClient({ region: process.env.AWS_REGION });
    }
    const { subject, body } = buildVerificationMail(purpose, code);
    await this.client.send(
      new SendEmailCommand({
        Source: from,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: { Text: { Data: body, Charset: 'UTF-8' } },
        },
      }),
    );
  }
}
