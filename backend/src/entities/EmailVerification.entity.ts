import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { VerificationPurpose } from '../modules/user/email-verification.constants';

@Entity()
@Index('idx_email_verification_email_purpose', ['email', 'purpose'])
export class EmailVerification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('varchar')
  email: string;

  // 'signup' | 'password_reset'
  @Column('varchar')
  purpose: VerificationPurpose;

  // 6자리 코드의 SHA-256 해시 — 평문 저장 금지
  @Column('varchar')
  codeHash: string;

  @Column('timestamp')
  expiresAt: Date;

  @Column('int', { default: 0 })
  attemptCount: number;

  @Column('timestamp', { nullable: true })
  verifiedAt: Date | null;

  // 가입 완료·비밀번호 변경에 사용된 시각 — 토큰 재사용 방지
  @Column('timestamp', { nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
