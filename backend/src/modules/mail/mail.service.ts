import { Injectable, Logger } from '@nestjs/common';
import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { VerificationPurpose } from '../user/email-verification.constants';
import {
  INQUIRY_TYPE_LABELS,
  InquiryType,
} from '../inquiry/inquiry.constants';

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

// 운영(NODE_ENV=prod)에서 MAIL_FROM이 비어있으면 MailService.send가 조용히
// 발송을 생략한다 — answer()의 트랜잭션 불변식(status==='answered'이면 메일이
// 실제로 발송됨)이 지켜지지 않는다. 부팅 시점에 막아 그 상태로 뜨는 것을 방지한다.
// dev 폴백은 그대로 두기 위해 dev/undefined에서는 아무 것도 하지 않는다.
// 'prod'와 'production' 둘 다 운영으로 취급한다 — 코드베이스 자체가 표기를
// 통일하지 못했다: docker-compose.yaml은 NODE_ENV=prod를 쓰지만
// app.module.ts의 로그 레벨 분기는 'production'을 검사한다. 부팅 가드가
// 유일한 방어선이므로 어느 쪽으로 떠도 걸리게 한다.
export function assertMailConfigured(
  nodeEnv: string | undefined,
  mailFrom: string | undefined,
): void {
  if (nodeEnv !== 'prod' && nodeEnv !== 'production') {
    return;
  }
  if (!mailFrom) {
    throw new Error(
      'MAIL_FROM이 설정되지 않았습니다. 운영에서는 회신·인증 메일이 조용히 발송되지 않으므로 부팅을 중단합니다.',
    );
  }
}

// 작성자가 메일만 보고 무엇에 대한 답변인지 알 수 있도록 원문을 함께 싣는다.
export function buildInquiryAnswerMail(
  type: InquiryType,
  content: string,
  answer: string,
): { subject: string; body: string } {
  return {
    subject: '[dn.gg] 문의하신 내용에 답변드립니다',
    body: [
      '안녕하세요, dn.gg입니다.',
      '보내주신 문의에 답변드립니다.',
      '',
      `■ 문의 유형: ${INQUIRY_TYPE_LABELS[type]}`,
      '',
      '■ 문의하신 내용',
      content,
      '',
      '■ 답변',
      answer,
      '',
      '추가로 궁금한 점이 있으면 앱의 [설정 → 문의·피드백]으로 다시 보내주세요.',
    ].join('\n'),
  };
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private client: SESClient | null = null;

  // SES 클라이언트 생성과 MAIL_FROM 폴백을 여기 한 곳에 모은다.
  // MAIL_FROM 미설정(dev)은 발송 실패가 아니라 정상 반환이다 — 기존 동작 유지.
  private async send(to: string, subject: string, body: string): Promise<void> {
    const from = process.env.MAIL_FROM;
    if (!from) {
      this.logger.warn(`[dev] ${to} 메일 발송 생략 — ${subject}\n${body}`);
      return;
    }
    if (!this.client) {
      this.client = new SESClient({ region: process.env.AWS_REGION });
    }
    await this.client.send(
      new SendEmailCommand({
        Source: from,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: { Text: { Data: body, Charset: 'UTF-8' } },
        },
      }),
    );
  }

  async sendVerificationCode(
    email: string,
    code: string,
    purpose: VerificationPurpose,
  ): Promise<void> {
    const { subject, body } = buildVerificationMail(purpose, code);
    await this.send(email, subject, body);
  }

  async sendInquiryAnswer(
    to: string,
    type: InquiryType,
    content: string,
    answer: string,
  ): Promise<void> {
    const { subject, body } = buildInquiryAnswerMail(type, content, answer);
    await this.send(to, subject, body);
  }
}
