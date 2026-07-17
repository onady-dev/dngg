import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, MoreThan, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { EmailVerification } from '../../entities/EmailVerification.entity';
import { User } from '../../entities/User.entity';
import { MailService } from '../mail/mail.service';
import {
  CODE_TTL_MS,
  DAILY_SEND_LIMIT,
  MAX_CONFIRM_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  VERIFICATION_TOKEN_TTL,
  VerificationPurpose,
} from './email-verification.constants';

export function hashCode(email: string, code: string): string {
  return crypto.createHash('sha256').update(`${email}:${code}`).digest('hex');
}

const INVALID_VERIFICATION =
  '이메일 인증이 유효하지 않습니다. 다시 인증해주세요.';

@Injectable()
export class EmailVerificationService {
  constructor(
    @InjectRepository(EmailVerification)
    private readonly verificationRepository: Repository<EmailVerification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
  ) {}

  async requestCode(
    email: string,
    purpose: VerificationPurpose,
  ): Promise<{ message: string }> {
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });
    if (purpose === 'signup' && existingUser) {
      throw new HttpException('이미 가입된 이메일입니다.', HttpStatus.CONFLICT);
    }
    // 계정 존재 탐색 방지 — 미가입 이메일이어도 성공처럼 응답하고 발송만 생략
    if (purpose === 'password_reset' && !existingUser) {
      return { message: '인증 코드를 발송했습니다.' };
    }

    const now = Date.now();
    const latest = await this.verificationRepository.findOne({
      where: { email, purpose },
      order: { createdAt: 'DESC' },
    });
    if (latest && now - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      throw new HttpException(
        '잠시 후 다시 시도해주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const sentInLastDay = await this.verificationRepository.count({
      where: {
        email,
        purpose,
        createdAt: MoreThan(new Date(now - 24 * 60 * 60 * 1000)),
      },
    });
    if (sentInLastDay >= DAILY_SEND_LIMIT) {
      throw new HttpException(
        '일일 발송 한도를 초과했습니다. 내일 다시 시도해주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await this.verificationRepository.save(
      this.verificationRepository.create({
        email,
        purpose,
        codeHash: hashCode(email, code),
        expiresAt: new Date(now + CODE_TTL_MS),
      }),
    );
    await this.mailService.sendVerificationCode(email, code, purpose);
    return { message: '인증 코드를 발송했습니다.' };
  }

  async confirmCode(
    email: string,
    code: string,
    purpose: VerificationPurpose,
  ): Promise<{ verificationToken: string }> {
    const latest = await this.verificationRepository.findOne({
      where: { email, purpose },
      order: { createdAt: 'DESC' },
    });
    if (!latest || latest.expiresAt.getTime() < Date.now()) {
      throw new HttpException(
        '인증 코드가 만료되었습니다. 다시 요청해주세요.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (latest.attemptCount >= MAX_CONFIRM_ATTEMPTS) {
      throw new HttpException(
        '시도 횟수를 초과했습니다. 코드를 다시 요청해주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (latest.codeHash !== hashCode(email, code)) {
      await this.verificationRepository.update(latest.id, {
        attemptCount: latest.attemptCount + 1,
      });
      throw new HttpException(
        '인증 코드가 올바르지 않습니다.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.verificationRepository.update(latest.id, {
      verifiedAt: new Date(),
    });
    const verificationToken = this.jwtService.sign(
      { email, purpose, verificationId: latest.id },
      { expiresIn: VERIFICATION_TOKEN_TTL },
    );
    return { verificationToken };
  }

  // 가입/비밀번호 변경 직전 최종 검증 — purpose·email 일치 + 미소비 확인.
  // 로그인 accessToken은 purpose가 없어 여기서 걸러진다.
  async assertVerified(
    token: string,
    purpose: VerificationPurpose,
  ): Promise<{ email: string; verificationId: number }> {
    let payload: { email?: string; purpose?: string; verificationId?: number };
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new HttpException(INVALID_VERIFICATION, HttpStatus.UNAUTHORIZED);
    }
    if (
      payload.purpose !== purpose ||
      !payload.verificationId ||
      !payload.email
    ) {
      throw new HttpException(INVALID_VERIFICATION, HttpStatus.UNAUTHORIZED);
    }
    const row = await this.verificationRepository.findOne({
      where: { id: payload.verificationId },
    });
    if (
      !row ||
      !row.verifiedAt ||
      row.consumedAt ||
      row.email !== payload.email
    ) {
      throw new HttpException(INVALID_VERIFICATION, HttpStatus.UNAUTHORIZED);
    }
    return { email: payload.email, verificationId: payload.verificationId };
  }

  async markConsumed(
    verificationId: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(EmailVerification)
      : this.verificationRepository;
    await repo.update(verificationId, { consumedAt: new Date() });
  }
}
