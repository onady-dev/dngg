# 회원가입 개선 (이메일 인증 + 비밀번호 재설정) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가입 전 이메일 6자리 코드 인증을 강제하고, 이름을 필수 정보로 추가하며, 전화번호(깨진 암호화 포함)를 제거하고, 이메일 기반 비밀번호 재설정을 추가한다.

**Architecture:** NestJS user 모듈에 `EmailVerificationService`를 추가하고 상태는 Postgres `EmailVerification` 테이블로 관리한다. 메일 발송은 신규 `mail` 모듈(AWS SES + dev 콘솔 폴백)이 담당한다. 코드 확인 성공 시 단기 JWT `verificationToken`을 발급하고, 가입/비밀번호 변경 API가 이 토큰을 검증·소비한다. 프론트는 이메일→코드 단계를 공용 컴포넌트로 만들어 가입과 재설정에서 공유한다.

**Tech Stack:** NestJS 11, TypeORM(Postgres, `synchronize: true`), `@nestjs/jwt`, bcrypt, `@aws-sdk/client-ses`(신규), Next.js 14 + styled-components, jest(spec은 `src/` 안 `*.spec.ts`).

**Spec:** `docs/superpowers/specs/2026-07-17-signup-improvement-design.md`

## Global Constraints

- 패키지 매니저는 **pnpm**, 명령은 반드시 `backend/` 또는 `frontend/` 디렉토리 안에서 실행한다.
- 커밋 메시지 설명은 **한글**, conventional commit 타입 접두어는 영문 (`feat:`, `fix:`, `test:`, `docs:`).
- 전역 ValidationPipe가 `whitelist + forbidNonWhitelisted` — 컨트롤러가 받는 모든 필드는 DTO에 데코레이터와 함께 선언해야 한다.
- `synchronize: true` — 엔티티 변경은 백엔드 재시작 즉시 접속 DB에 반영된다. 개발 중에는 로컬 DB(`docker compose up -d db`)만 사용할 것.
- 프론트 API 호출은 `@/lib/axios`만 사용 (`src/app/lib/axios.ts` 레거시 파일 금지). 토스트는 `useToast`.
- 인증 코드 정책: 만료 10분, 재발송 쿨다운 60초, 일일 발송 한도 이메일당 10회, 확인 시도 5회, verificationToken 15분.
- **배포 주의:** Task 5 이후 백엔드는 구버전 프론트의 가입 요청(`phoneNumber` 포함, `verificationToken` 없음)을 거부한다. 백엔드와 프론트를 반드시 함께 배포할 것.
- 비밀번호 최소 8자 정책은 **신규 가입·비밀번호 변경에만** 적용된다 (기존 유저 로그인엔 영향 없음).

---

### Task 1: EmailVerification 엔티티 + 인증 상수

**Files:**
- Create: `backend/src/modules/user/email-verification.constants.ts`
- Create: `backend/src/entities/EmailVerification.entity.ts`

**Interfaces:**
- Consumes: 없음 (최초 태스크)
- Produces: `EmailVerification` 엔티티 클래스, `VerificationPurpose` 타입(`'signup' | 'password_reset'`), 상수 `CODE_TTL_MS`, `RESEND_COOLDOWN_MS`, `DAILY_SEND_LIMIT`, `MAX_CONFIRM_ATTEMPTS`, `VERIFICATION_TOKEN_TTL`, `VERIFICATION_PURPOSES`

- [ ] **Step 1: 상수 파일 작성**

`backend/src/modules/user/email-verification.constants.ts`:

```typescript
export const VERIFICATION_PURPOSES = ['signup', 'password_reset'] as const;
export type VerificationPurpose = (typeof VERIFICATION_PURPOSES)[number];

export const CODE_TTL_MS = 10 * 60 * 1000; // 코드 만료 10분
export const RESEND_COOLDOWN_MS = 60 * 1000; // 재발송 쿨다운 60초
export const DAILY_SEND_LIMIT = 10; // 이메일당 24시간 발송 한도
export const MAX_CONFIRM_ATTEMPTS = 5; // 코드 확인 시도 한도
export const VERIFICATION_TOKEN_TTL = '15m'; // confirm 후 발급되는 단기 토큰 수명
```

- [ ] **Step 2: 엔티티 작성**

`backend/src/entities/EmailVerification.entity.ts`:

```typescript
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
```

- [ ] **Step 3: 빌드로 타입 확인**

Run: `cd backend && pnpm build`
Expected: 에러 없이 종료 (webpack/tsc 성공)

- [ ] **Step 4: Commit**

```bash
git add backend/src/entities/EmailVerification.entity.ts backend/src/modules/user/email-verification.constants.ts
git commit -m "feat: 이메일 인증 상태 저장용 EmailVerification 엔티티 추가"
```

---

### Task 2: MailService — AWS SES + dev 콘솔 폴백

**Files:**
- Create: `backend/src/modules/mail/mail.service.ts`
- Create: `backend/src/modules/mail/mail.module.ts`
- Test: `backend/src/modules/mail/mail.service.spec.ts`

**Interfaces:**
- Consumes: Task 1의 `VerificationPurpose`
- Produces: `MailService.sendVerificationCode(email: string, code: string, purpose: VerificationPurpose): Promise<void>`, 순수 함수 `buildVerificationMail(purpose, code): { subject: string; body: string }`, `MailModule`(exports: `MailService`)

- [ ] **Step 1: 의존성 설치**

Run: `cd backend && pnpm add @aws-sdk/client-ses`
Expected: package.json dependencies에 `@aws-sdk/client-ses` 추가

- [ ] **Step 2: 실패하는 테스트 작성**

`backend/src/modules/mail/mail.service.spec.ts`:

```typescript
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
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd backend && pnpm test -- src/modules/mail/mail.service.spec.ts`
Expected: FAIL — `Cannot find module './mail.service'`

- [ ] **Step 4: MailService 구현**

`backend/src/modules/mail/mail.service.ts`:

```typescript
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
```

`backend/src/modules/mail/mail.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd backend && pnpm test -- src/modules/mail/mail.service.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/pnpm-lock.yaml backend/src/modules/mail/
git commit -m "feat: AWS SES 기반 메일 모듈 추가 (dev 콘솔 폴백 포함)"
```

---

### Task 3: EmailVerificationService — 코드 발급·확인·토큰 검증

**Files:**
- Create: `backend/src/modules/user/email-verification.service.ts`
- Test: `backend/src/modules/user/email-verification.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 상수/엔티티, Task 2 `MailService.sendVerificationCode`
- Produces (이후 태스크가 의존하는 정확한 시그니처):
  - `requestCode(email: string, purpose: VerificationPurpose): Promise<{ message: string }>`
  - `confirmCode(email: string, code: string, purpose: VerificationPurpose): Promise<{ verificationToken: string }>`
  - `assertVerified(token: string, purpose: VerificationPurpose): Promise<{ email: string; verificationId: number }>`
  - `markConsumed(verificationId: number, manager?: EntityManager): Promise<void>`
  - 순수 함수 `hashCode(email: string, code: string): string`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/modules/user/email-verification.service.spec.ts`:

```typescript
import { EmailVerificationService, hashCode } from './email-verification.service';

const createVerificationRepoMock = () => ({
  findOne: jest.fn(),
  count: jest.fn(),
  create: jest.fn((v: any) => v),
  save: jest.fn(),
  update: jest.fn(),
});

describe('EmailVerificationService', () => {
  let verificationRepo: ReturnType<typeof createVerificationRepoMock>;
  let userRepo: { findOne: jest.Mock };
  let mailService: { sendVerificationCode: jest.Mock };
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let service: EmailVerificationService;

  beforeEach(() => {
    verificationRepo = createVerificationRepoMock();
    userRepo = { findOne: jest.fn() };
    mailService = { sendVerificationCode: jest.fn() };
    jwtService = {
      sign: jest.fn().mockReturnValue('verification-token'),
      verify: jest.fn(),
    };
    service = new EmailVerificationService(
      verificationRepo as any,
      userRepo as any,
      mailService as any,
      jwtService as any,
    );
  });

  describe('requestCode', () => {
    test('signup: 이미 가입된 이메일이면 409', async () => {
      userRepo.findOne.mockResolvedValue({ id: 1 });
      await expect(service.requestCode('a@b.c', 'signup')).rejects.toMatchObject({
        status: 409,
      });
    });

    test('password_reset: 미가입 이메일이면 발송 없이 성공 응답 (계정 탐색 방지)', async () => {
      userRepo.findOne.mockResolvedValue(null);
      const result = await service.requestCode('a@b.c', 'password_reset');
      expect(result.message).toBeDefined();
      expect(mailService.sendVerificationCode).not.toHaveBeenCalled();
      expect(verificationRepo.save).not.toHaveBeenCalled();
    });

    test('쿨다운 60초 안에 재요청하면 429', async () => {
      userRepo.findOne.mockResolvedValue(null);
      verificationRepo.findOne.mockResolvedValue({ createdAt: new Date() });
      await expect(service.requestCode('a@b.c', 'signup')).rejects.toMatchObject({
        status: 429,
      });
    });

    test('24시간 발송 한도(10회) 초과 시 429', async () => {
      userRepo.findOne.mockResolvedValue(null);
      verificationRepo.findOne.mockResolvedValue(null);
      verificationRepo.count.mockResolvedValue(10);
      await expect(service.requestCode('a@b.c', 'signup')).rejects.toMatchObject({
        status: 429,
      });
    });

    test('정상 요청은 6자리 코드를 해시로 저장하고 메일을 발송한다', async () => {
      userRepo.findOne.mockResolvedValue(null);
      verificationRepo.findOne.mockResolvedValue(null);
      verificationRepo.count.mockResolvedValue(0);

      await service.requestCode('a@b.c', 'signup');

      const saved = verificationRepo.save.mock.calls[0][0];
      expect(saved.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(saved.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(mailService.sendVerificationCode).toHaveBeenCalledWith(
        'a@b.c',
        expect.stringMatching(/^\d{6}$/),
        'signup',
      );
    });
  });

  describe('confirmCode', () => {
    const validRow = (code: string) => ({
      id: 5,
      email: 'a@b.c',
      purpose: 'signup',
      codeHash: hashCode('a@b.c', code),
      expiresAt: new Date(Date.now() + 60_000),
      attemptCount: 0,
      verifiedAt: null,
      consumedAt: null,
      createdAt: new Date(),
    });

    test('발급 이력이 없으면 400', async () => {
      verificationRepo.findOne.mockResolvedValue(null);
      await expect(service.confirmCode('a@b.c', '123456', 'signup')).rejects.toMatchObject({
        status: 400,
      });
    });

    test('만료된 코드는 400', async () => {
      verificationRepo.findOne.mockResolvedValue({
        ...validRow('123456'),
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.confirmCode('a@b.c', '123456', 'signup')).rejects.toMatchObject({
        status: 400,
      });
    });

    test('시도 5회 도달 시 429', async () => {
      verificationRepo.findOne.mockResolvedValue({
        ...validRow('123456'),
        attemptCount: 5,
      });
      await expect(service.confirmCode('a@b.c', '123456', 'signup')).rejects.toMatchObject({
        status: 429,
      });
    });

    test('코드 불일치 시 attemptCount 증가 후 400', async () => {
      verificationRepo.findOne.mockResolvedValue(validRow('123456'));
      await expect(service.confirmCode('a@b.c', '000000', 'signup')).rejects.toMatchObject({
        status: 400,
      });
      expect(verificationRepo.update).toHaveBeenCalledWith(5, { attemptCount: 1 });
    });

    test('성공 시 verifiedAt 기록 후 verificationToken 반환', async () => {
      verificationRepo.findOne.mockResolvedValue(validRow('123456'));

      const result = await service.confirmCode('a@b.c', '123456', 'signup');

      expect(verificationRepo.update).toHaveBeenCalledWith(5, {
        verifiedAt: expect.any(Date),
      });
      expect(jwtService.sign).toHaveBeenCalledWith(
        { email: 'a@b.c', purpose: 'signup', verificationId: 5 },
        { expiresIn: '15m' },
      );
      expect(result.verificationToken).toBe('verification-token');
    });
  });

  describe('assertVerified', () => {
    test('서명 검증 실패 토큰은 401', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid');
      });
      await expect(service.assertVerified('bad-token', 'signup')).rejects.toMatchObject({
        status: 401,
      });
    });

    test('purpose 불일치 토큰은 401 (로그인 accessToken 재사용 차단)', async () => {
      jwtService.verify.mockReturnValue({ userId: 1, email: 'a@b.c', groupId: 2 });
      await expect(service.assertVerified('login-token', 'signup')).rejects.toMatchObject({
        status: 401,
      });
    });

    test('이미 소비된 인증은 401', async () => {
      jwtService.verify.mockReturnValue({
        email: 'a@b.c',
        purpose: 'signup',
        verificationId: 5,
      });
      verificationRepo.findOne.mockResolvedValue({
        id: 5,
        email: 'a@b.c',
        verifiedAt: new Date(),
        consumedAt: new Date(),
      });
      await expect(service.assertVerified('token', 'signup')).rejects.toMatchObject({
        status: 401,
      });
    });

    test('정상 토큰은 email과 verificationId를 반환한다', async () => {
      jwtService.verify.mockReturnValue({
        email: 'a@b.c',
        purpose: 'signup',
        verificationId: 5,
      });
      verificationRepo.findOne.mockResolvedValue({
        id: 5,
        email: 'a@b.c',
        verifiedAt: new Date(),
        consumedAt: null,
      });
      await expect(service.assertVerified('token', 'signup')).resolves.toEqual({
        email: 'a@b.c',
        verificationId: 5,
      });
    });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pnpm test -- src/modules/user/email-verification.service.spec.ts`
Expected: FAIL — `Cannot find module './email-verification.service'`

- [ ] **Step 3: 서비스 구현**

`backend/src/modules/user/email-verification.service.ts`:

```typescript
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

const INVALID_VERIFICATION = '이메일 인증이 유효하지 않습니다. 다시 인증해주세요.';

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
    const existingUser = await this.userRepository.findOne({ where: { email } });
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
    if (payload.purpose !== purpose || !payload.verificationId || !payload.email) {
      throw new HttpException(INVALID_VERIFICATION, HttpStatus.UNAUTHORIZED);
    }
    const row = await this.verificationRepository.findOne({
      where: { id: payload.verificationId },
    });
    if (!row || !row.verifiedAt || row.consumedAt || row.email !== payload.email) {
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && pnpm test -- src/modules/user/email-verification.service.spec.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/user/email-verification.service.ts backend/src/modules/user/email-verification.service.spec.ts
git commit -m "feat: 이메일 인증 코드 발급·확인·토큰 검증 서비스 추가"
```

---

### Task 4: 인증 API 노출 + 모듈 배선

**Files:**
- Modify: `backend/src/modules/user/user.request.dto.ts` (DTO 추가)
- Modify: `backend/src/modules/user/user.controller.ts`
- Modify: `backend/src/modules/user/user.module.ts`

**Interfaces:**
- Consumes: Task 3 `EmailVerificationService.requestCode` / `confirmCode`, Task 2 `MailModule`
- Produces: `POST /user/email-verification/request` (body: `{ email, purpose }`), `POST /user/email-verification/confirm` (body: `{ email, code, purpose }` → `{ verificationToken }`), DTO 클래스 `RequestEmailVerificationDto`, `ConfirmEmailVerificationDto`

- [ ] **Step 1: DTO 추가**

`backend/src/modules/user/user.request.dto.ts` — 기존 CreateUserDto/UpdateUserDto는 그대로 두고(Task 5에서 개편) 파일 하단에 추가, import 행은 다음으로 교체:

```typescript
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import {
  VERIFICATION_PURPOSES,
  VerificationPurpose,
} from './email-verification.constants';
```

파일 하단에 추가:

```typescript
export class RequestEmailVerificationDto {
  @IsEmail()
  email: string;
  @IsIn(VERIFICATION_PURPOSES)
  purpose: VerificationPurpose;
}

export class ConfirmEmailVerificationDto {
  @IsEmail()
  email: string;
  @IsString()
  @Length(6, 6)
  code: string;
  @IsIn(VERIFICATION_PURPOSES)
  purpose: VerificationPurpose;
}
```

- [ ] **Step 2: 컨트롤러 엔드포인트 추가**

`backend/src/modules/user/user.controller.ts` — import에 `EmailVerificationService`, 새 DTO 2종 추가, 생성자와 라우트 추가:

```typescript
import { Controller, Post, Body, Put, Param, Delete, ValidationPipe, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import {
  ConfirmEmailVerificationDto,
  CreateUserDto,
  RequestEmailVerificationDto,
  UpdateUserDto,
} from './user.request.dto';
import { EmailVerificationService } from './email-verification.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  @Post('email-verification/request')
  async requestEmailVerification(
    @Body(ValidationPipe) dto: RequestEmailVerificationDto,
  ) {
    return this.emailVerificationService.requestCode(dto.email, dto.purpose);
  }

  @Post('email-verification/confirm')
  async confirmEmailVerification(
    @Body(ValidationPipe) dto: ConfirmEmailVerificationDto,
  ) {
    return this.emailVerificationService.confirmCode(
      dto.email,
      dto.code,
      dto.purpose,
    );
  }

  // ... 기존 createUser / updateUser / deleteUser / loginUser 라우트는 그대로 유지
}
```

(주의: 기존 `@Get`/`@Query` import는 사용되지 않으므로 import 목록에서 제거해도 된다. 기존 라우트 본문은 변경하지 않는다.)

- [ ] **Step 3: 모듈 배선**

`backend/src/modules/user/user.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../entities/User.entity';
import { EmailVerification } from '../../entities/EmailVerification.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { UserRepository } from '../../repository/user.repository';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { GroupRepository } from 'src/repository/group.repository';
import { Group } from 'src/entities/Group.entity';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailModule } from '../mail/mail.module';
import { EmailVerificationService } from './email-verification.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
      }),
    }),
    TypeOrmModule.forFeature([User, Group, EmailVerification]),
    MailModule,
  ],
  controllers: [UserController],
  providers: [
    UserService,
    EmailVerificationService,
    JwtStrategy,
    UserRepository,
    GroupRepository,
  ],
})
export class UserModule {}
```

- [ ] **Step 4: 전체 테스트 + 부팅 확인**

Run: `cd backend && pnpm test && pnpm build`
Expected: 기존 spec 포함 전체 PASS, 빌드 성공

Run (로컬 DB가 떠 있을 때): `cd backend && pnpm dev` 후 별도 셸에서

```bash
curl -s -X POST localhost:3010/user/email-verification/request \
  -H 'Content-Type: application/json' \
  -d '{"email":"plan-test@example.com","purpose":"signup"}'
```

Expected: `{"message":"인증 코드를 발송했습니다."}` 응답, 백엔드 로그에 `[dev] plan-test@example.com signup 인증 코드: NNNNNN` 출력. 확인 후 `pnpm dev` 종료.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/user/
git commit -m "feat: 이메일 인증 요청·확인 API 및 user 모듈 배선 추가"
```

---

### Task 5: User 엔티티 개편 — name 추가, phoneNumber 제거, 가입 시 인증 강제

**Files:**
- Modify: `backend/src/entities/User.entity.ts`
- Modify: `backend/src/modules/user/user.request.dto.ts` (CreateUserDto/UpdateUserDto 개편)
- Modify: `backend/src/modules/user/user.service.ts`
- Modify: `backend/src/modules/user/user-role.spec.ts` (생성자 인자 5개로)
- Delete: `backend/src/modules/user/crypto.util.ts`
- Test: `backend/src/modules/user/user-signup.spec.ts` (신규)

**Interfaces:**
- Consumes: Task 3 `assertVerified` / `markConsumed`
- Produces: `UserService.createUser(dto: CreateUserDto)` — dto에 `verificationToken` 필수·`phoneNumber` 없음. `User.name: string | null`. `UserService` 생성자 시그니처: `(userRepository, groupRepository, dataSource, jwtService, emailVerificationService)` — **기존 4개 뒤에 추가**.

⚠️ 이 태스크부터 백엔드 재시작 시 운영/로컬 DB에서 `user.phoneNumber` 컬럼이 drop된다(synchronize). 운영 데이터 삭제는 스펙에서 승인 완료. 개발은 로컬 DB로만 진행한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/modules/user/user-signup.spec.ts`:

```typescript
import { HttpException, HttpStatus } from '@nestjs/common';
import { UserService } from './user.service';

const makeQueryRunner = () => ({
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  manager: {
    create: jest.fn((_entity: any, v: any) => v),
    save: jest.fn((_entity: any, v: any) => Promise.resolve({ id: 1, ...v })),
  },
});

const baseDto = {
  email: 'a@b.c',
  password: 'password123',
  name: '홍길동',
  groupName: '테스트그룹',
  verificationToken: 'valid-token',
};

describe('createUser 이메일 인증 강제', () => {
  test('assertVerified가 거부하면 가입이 진행되지 않는다', async () => {
    const emailVerification = {
      assertVerified: jest
        .fn()
        .mockRejectedValue(
          new HttpException('invalid', HttpStatus.UNAUTHORIZED),
        ),
      markConsumed: jest.fn(),
    };
    const queryRunner = makeQueryRunner();
    const dataSource = { createQueryRunner: () => queryRunner };
    const service = new UserService(
      {} as any,
      {} as any,
      dataSource as any,
      {} as any,
      emailVerification as any,
    );

    await expect(service.createUser(baseDto as any)).rejects.toMatchObject({
      status: 401,
    });
    expect(queryRunner.startTransaction).not.toHaveBeenCalled();
  });

  test('토큰의 email과 dto.email이 다르면 401', async () => {
    const emailVerification = {
      assertVerified: jest
        .fn()
        .mockResolvedValue({ email: 'other@b.c', verificationId: 5 }),
      markConsumed: jest.fn(),
    };
    const dataSource = { createQueryRunner: () => makeQueryRunner() };
    const service = new UserService(
      {} as any,
      {} as any,
      dataSource as any,
      {} as any,
      emailVerification as any,
    );

    await expect(service.createUser(baseDto as any)).rejects.toMatchObject({
      status: 401,
    });
  });

  test('정상 토큰이면 가입하고 인증을 소비한다', async () => {
    const emailVerification = {
      assertVerified: jest
        .fn()
        .mockResolvedValue({ email: 'a@b.c', verificationId: 5 }),
      markConsumed: jest.fn(),
    };
    const queryRunner = makeQueryRunner();
    const dataSource = { createQueryRunner: () => queryRunner };
    const service = new UserService(
      {} as any,
      {} as any,
      dataSource as any,
      {} as any,
      emailVerification as any,
    );

    const user = await service.createUser(baseDto as any);

    expect(user.name).toBe('홍길동');
    expect((user as any).phoneNumber).toBeUndefined();
    expect(emailVerification.markConsumed).toHaveBeenCalledWith(
      5,
      queryRunner.manager,
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pnpm test -- src/modules/user/user-signup.spec.ts`
Expected: FAIL — UserService 생성자가 4개 인자이고 `assertVerified` 호출이 없어 실패

- [ ] **Step 3: 엔티티·DTO·서비스 수정**

`backend/src/entities/User.entity.ts` — `phoneNumber` 컬럼을 삭제하고 `name` 추가:

```typescript
import { Column, Entity, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Group } from './Group.entity';
@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;
  @Column('int')
  groupId: number;
  @Column('varchar', { unique: true })
  email: string;
  @Column('varchar')
  password: string;
  // 표시용 이름 — 신규 가입은 필수(DTO에서 강제), 기존 유저는 null이라 nullable
  @Column('varchar', { length: 30, nullable: true })
  name: string | null;
  @Column('timestamp', { default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  // 'user' | 'admin' — 최초 관리자는 DB 수동 지정 (UPDATE "user" SET role='admin' WHERE email='...')
  @Column('varchar', { default: 'user' })
  role: string;

  @OneToOne(() => Group, (group) => group.id)
  group: Group;
}
```

`backend/src/modules/user/user.request.dto.ts` — CreateUserDto/UpdateUserDto를 다음으로 교체 (import에 `MinLength` 추가):

```typescript
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';
import {
  VERIFICATION_PURPOSES,
  VerificationPurpose,
} from './email-verification.constants';

export class CreateUserDto {
  @IsEmail()
  email: string;
  @IsString()
  @MinLength(8)
  password: string;
  @IsString()
  @Length(1, 30)
  name: string;
  @IsNotEmpty()
  @IsString()
  groupName: string;
  @IsNotEmpty()
  @IsString()
  verificationToken: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
  @IsOptional()
  @IsString()
  @Length(1, 30)
  name?: string;
}
```

(RequestEmailVerificationDto / ConfirmEmailVerificationDto는 Task 4에서 추가된 그대로 유지.)

`backend/src/modules/user/user.service.ts` — `encrypt` import 제거, 생성자에 `EmailVerificationService` 추가, `createUser`/`updateUser` 수정:

```typescript
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../../entities/User.entity';
import { CreateUserDto, UpdateUserDto } from './user.request.dto';
import { Group } from 'src/entities/Group.entity';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { UserRepository } from '../../repository/user.repository';
import { GroupRepository } from 'src/repository/group.repository';
import { EmailVerificationService } from './email-verification.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly groupRepository: GroupRepository,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  async createUser(dto: CreateUserDto): Promise<User> {
    // 이메일 인증을 통과한 요청만 가입 가능 — 토큰의 email과 가입 email이 일치해야 한다
    const { email: verifiedEmail, verificationId } =
      await this.emailVerificationService.assertVerified(
        dto.verificationToken,
        'signup',
      );
    if (verifiedEmail !== dto.email) {
      throw new HttpException(
        '이메일 인증이 유효하지 않습니다. 다시 인증해주세요.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const group = queryRunner.manager.create(Group, { name: dto.groupName });
      const savedGroup = await queryRunner.manager.save(Group, group);
      const hashedPassword = await bcrypt.hash(dto.password, 10);
      const user = queryRunner.manager.create(User, {
        email: dto.email,
        name: dto.name,
        groupId: savedGroup.id,
        password: hashedPassword,
      });
      const savedUser = await queryRunner.manager.save(User, user);
      await this.emailVerificationService.markConsumed(
        verificationId,
        queryRunner.manager,
      );
      await queryRunner.commitTransaction();
      return savedUser;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (error.code === '23505') {
        if (error.table === 'user') {
          throw new HttpException('Email already exists', HttpStatus.BAD_REQUEST);
        }
        throw new HttpException('Group name already exists', HttpStatus.BAD_REQUEST);
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async updateUser(id: number, dto: UpdateUserDto): Promise<User> {
    const updateData: any = { ...dto };
    if (dto.password) {
      updateData.password = await bcrypt.hash(dto.password, 10);
    }
    await this.userRepository.update(id, updateData);
    return await this.userRepository.findOneOrFail({ where: { id } });
  }

  // deleteUser / loginUser는 기존 그대로 유지
}
```

`backend/src/modules/user/user-role.spec.ts` — `new UserService(...)` 호출에 다섯 번째 인자 `{} as any` 추가:

```typescript
    const service = new UserService(
      userRepo as any,
      {} as any,
      {} as any,
      jwtService as any,
      {} as any,
    );
```

- [ ] **Step 4: crypto.util.ts 삭제**

Run: `git rm backend/src/modules/user/crypto.util.ts`
Expected: 삭제 스테이징. `grep -rn "crypto.util" backend/src` 결과 없음 확인.

- [ ] **Step 5: 전체 테스트 통과 확인**

Run: `cd backend && pnpm test && pnpm build`
Expected: user-signup.spec 3개 포함 전체 PASS, 빌드 성공

- [ ] **Step 6: Commit**

```bash
git add backend/src
git commit -m "feat: 가입에 이메일 인증 토큰 강제, 이름 필드 추가 및 전화번호(취약 암호화) 제거"
```

---

### Task 6: 비밀번호 재설정 API

**Files:**
- Modify: `backend/src/modules/user/user.request.dto.ts` (ResetPasswordDto 추가)
- Modify: `backend/src/modules/user/user.service.ts` (resetPassword 추가)
- Modify: `backend/src/modules/user/user.controller.ts` (POST /user/password-reset)
- Test: `backend/src/modules/user/password-reset.spec.ts` (신규)

**Interfaces:**
- Consumes: Task 3 `assertVerified` / `markConsumed`, Task 5의 UserService 생성자(5개 인자)
- Produces: `POST /user/password-reset` (body: `{ verificationToken, newPassword }` → `{ message }`), `UserService.resetPassword(verificationToken: string, newPassword: string): Promise<{ message: string }>`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/modules/user/password-reset.spec.ts`:

```typescript
import * as bcrypt from 'bcrypt';
import { UserService } from './user.service';

describe('resetPassword', () => {
  const makeService = (overrides?: {
    user?: any;
    assertVerified?: jest.Mock;
  }) => {
    const userRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue(
          overrides?.user !== undefined ? overrides.user : { id: 3, email: 'a@b.c' },
        ),
      update: jest.fn(),
    };
    const emailVerification = {
      assertVerified:
        overrides?.assertVerified ??
        jest.fn().mockResolvedValue({ email: 'a@b.c', verificationId: 9 }),
      markConsumed: jest.fn(),
    };
    const service = new UserService(
      userRepo as any,
      {} as any,
      {} as any,
      {} as any,
      emailVerification as any,
    );
    return { service, userRepo, emailVerification };
  };

  test('password_reset 인증 토큰으로 비밀번호를 bcrypt 해시로 교체한다', async () => {
    const { service, userRepo, emailVerification } = makeService();

    const result = await service.resetPassword('token', 'newpassword1');

    expect(emailVerification.assertVerified).toHaveBeenCalledWith(
      'token',
      'password_reset',
    );
    const [id, data] = userRepo.update.mock.calls[0];
    expect(id).toBe(3);
    expect(await bcrypt.compare('newpassword1', data.password)).toBe(true);
    expect(emailVerification.markConsumed).toHaveBeenCalledWith(9);
    expect(result.message).toBeDefined();
  });

  test('토큰의 이메일로 유저를 못 찾으면 404', async () => {
    const { service } = makeService({ user: null });
    await expect(service.resetPassword('token', 'newpassword1')).rejects.toMatchObject(
      { status: 404 },
    );
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pnpm test -- src/modules/user/password-reset.spec.ts`
Expected: FAIL — `service.resetPassword is not a function`

- [ ] **Step 3: 구현**

`backend/src/modules/user/user.request.dto.ts` 하단에 추가:

```typescript
export class ResetPasswordDto {
  @IsNotEmpty()
  @IsString()
  verificationToken: string;
  @IsString()
  @MinLength(8)
  newPassword: string;
}
```

`backend/src/modules/user/user.service.ts`에 메서드 추가 (loginUser 아래):

```typescript
  async resetPassword(
    verificationToken: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const { email, verificationId } =
      await this.emailVerificationService.assertVerified(
        verificationToken,
        'password_reset',
      );
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.userRepository.update(user.id, { password: hashedPassword });
    await this.emailVerificationService.markConsumed(verificationId);
    return { message: '비밀번호가 변경되었습니다.' };
  }
```

`backend/src/modules/user/user.controller.ts`에 라우트 추가 (import에 `ResetPasswordDto` 추가):

```typescript
  @Post('password-reset')
  async resetPassword(@Body(ValidationPipe) dto: ResetPasswordDto) {
    return this.userService.resetPassword(dto.verificationToken, dto.newPassword);
  }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && pnpm test`
Expected: 전체 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/user/
git commit -m "feat: 이메일 인증 기반 비밀번호 재설정 API 추가"
```

---

### Task 7: 프론트 공용 EmailCodeVerification 컴포넌트

**Files:**
- Create: `frontend/src/app/components/EmailCodeVerification.tsx`

**Interfaces:**
- Consumes: 백엔드 `POST /user/email-verification/request`, `POST /user/email-verification/confirm` (Task 4), `Login.tsx`의 export된 styled 컴포넌트(`AuthForm`, `AuthInput`, `AuthSubmitButton`)
- Produces: `<EmailCodeVerification purpose submitLabel onVerified />` — `purpose: 'signup' | 'password_reset'`, `onVerified: (email: string, verificationToken: string) => void`. 이메일 입력→코드 발송→코드 확인까지 내부에서 처리하고 성공 시 `onVerified` 호출.

- [ ] **Step 1: 컴포넌트 작성**

`frontend/src/app/components/EmailCodeVerification.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import styled from "styled-components";
import api from "@/lib/axios";
import { useToast } from "./ui/Toast";
import { AuthForm, AuthInput, AuthSubmitButton } from "./Login";

const CodeRow = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
`;

const TimerText = styled.span`
  font-size: 0.8125rem;
  color: #6b7280;
  min-width: 3.5rem;
  text-align: right;
`;

const ResendButton = styled.button`
  font-size: 0.8125rem;
  color: var(--primary-color);
  font-weight: 600;
  white-space: nowrap;

  &:disabled {
    color: #9ca3af;
    cursor: not-allowed;
  }
`;

export type VerificationPurpose = "signup" | "password_reset";

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const EmailCodeVerification = ({
  purpose,
  submitLabel,
  onVerified,
}: {
  purpose: VerificationPurpose;
  submitLabel: string;
  onVerified: (email: string, verificationToken: string) => void;
}) => {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0); // 코드 만료(10분)
  const [resendCooldown, setResendCooldown] = useState(0); // 재발송 쿨다운(60초)
  const [isBusy, setIsBusy] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!codeSent) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      setResendCooldown((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [codeSent]);

  const requestCode = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await api.post("/user/email-verification/request", { email, purpose });
      setCodeSent(true);
      setCode("");
      setSecondsLeft(600);
      setResendCooldown(60);
      showToast("인증 코드를 발송했습니다. 메일함을 확인해주세요.", "success");
    } catch (error: any) {
      const message = error?.response?.data?.message;
      showToast(message || "인증 코드 발송에 실패했습니다.", "error");
    } finally {
      setIsBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeSent) {
      await requestCode();
      return;
    }
    if (isBusy) return;
    setIsBusy(true);
    try {
      const response = await api.post("/user/email-verification/confirm", {
        email,
        code,
        purpose,
      });
      onVerified(email, response.data.verificationToken);
    } catch (error: any) {
      const message = error?.response?.data?.message;
      showToast(message || "인증에 실패했습니다.", "error");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <AuthForm onSubmit={handleSubmit}>
      <AuthInput
        type="email"
        placeholder="이메일"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        disabled={codeSent}
        autoComplete="email"
      />
      {codeSent && (
        <CodeRow>
          <AuthInput
            type="text"
            inputMode="numeric"
            placeholder="인증 코드 6자리"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            required
            style={{ flex: 1 }}
          />
          <TimerText>{formatTime(secondsLeft)}</TimerText>
          <ResendButton
            type="button"
            onClick={requestCode}
            disabled={resendCooldown > 0 || isBusy}
          >
            {resendCooldown > 0 ? `재발송 (${resendCooldown}s)` : "재발송"}
          </ResendButton>
        </CodeRow>
      )}
      <AuthSubmitButton type="submit" disabled={isBusy}>
        {codeSent ? submitLabel : "인증코드 발송"}
      </AuthSubmitButton>
    </AuthForm>
  );
};

export default EmailCodeVerification;
```

- [ ] **Step 2: 빌드 확인**

Run: `cd frontend && pnpm build`
Expected: 컴파일 에러 없음 (아직 어디서도 import하지 않으므로 경고 없음)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/components/EmailCodeVerification.tsx
git commit -m "feat: 이메일 인증 코드 입력 공용 컴포넌트 추가"
```

---

### Task 8: Signup 3단계 개편 + 설정 페이지 view 전환

**Files:**
- Modify: `frontend/src/app/components/Signup.tsx` (전면 재작성)
- Modify: `frontend/src/app/components/Login.tsx` (prop 교체 + 비밀번호 찾기 링크)
- Modify: `frontend/src/app/settings/page.tsx` (view 상태 도입)

**Interfaces:**
- Consumes: Task 7 `EmailCodeVerification`, 백엔드 `POST /user` (Task 5 — body: `{ email, password, name, groupName, verificationToken }`)
- Produces: `AuthView` 타입(`'login' | 'signup' | 'reset'`) — `Signup.tsx`에서 export. `Signup`/`Login`은 `setView: (view: AuthView) => void` prop을 받는다. (Task 9의 `PasswordReset`도 동일 prop 계약을 따른다.)

- [ ] **Step 1: Signup.tsx 재작성**

`frontend/src/app/components/Signup.tsx` 전체를 다음으로 교체:

```tsx
"use client";

import { useState } from "react";
import { api } from "@/lib/axios";
import { useToast } from "./ui/Toast";
import EmailCodeVerification from "./EmailCodeVerification";
import {
  AuthCard,
  AuthContainer,
  AuthForm,
  AuthInput,
  AuthSubmitButton,
  AuthSwitchButton,
  AuthSwitchRow,
  AuthTitle,
} from "./Login";

export type AuthView = "login" | "signup" | "reset";

const Signup = ({ setView }: { setView: (view: AuthView) => void }) => {
  // 1·2단계(이메일 인증)를 통과하면 verifiedEmail이 채워지고 3단계 폼으로 전환된다
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [groupName, setGroupName] = useState("");
  const { showToast } = useToast();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      showToast("비밀번호가 일치하지 않습니다.", "error");
      return;
    }
    if (password.length < 8) {
      showToast("비밀번호는 8자 이상이어야 합니다.", "error");
      return;
    }
    try {
      await api.post(`/user`, {
        email: verifiedEmail,
        password,
        name,
        groupName,
        verificationToken,
      });
      showToast("회원가입이 완료되었습니다. 로그인해주세요.", "success");
      setView("login");
    } catch (error: any) {
      const message = error?.response?.data?.message;
      showToast(message || "회원가입에 실패했습니다. 잠시 후 다시 시도해주세요.", "error");
    }
  };

  return (
    <AuthContainer>
      <AuthCard>
        <AuthTitle>회원가입</AuthTitle>
        {!verifiedEmail ? (
          <EmailCodeVerification
            purpose="signup"
            submitLabel="인증 확인"
            onVerified={(email, token) => {
              setVerifiedEmail(email);
              setVerificationToken(token);
            }}
          />
        ) : (
          <AuthForm onSubmit={handleSignup}>
            <AuthInput type="email" value={verifiedEmail} disabled />
            <AuthInput
              type="text"
              placeholder="이름 (닉네임)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={30}
            />
            <AuthInput
              type="password"
              placeholder="비밀번호 (8자 이상)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <AuthInput
              type="password"
              placeholder="비밀번호 확인"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <AuthInput
              type="text"
              placeholder="그룹 이름 (모임/팀 이름)"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              required
            />
            <AuthSubmitButton type="submit">회원가입</AuthSubmitButton>
          </AuthForm>
        )}
        <AuthSwitchRow>
          <span>이미 계정이 있으신가요?</span>
          <AuthSwitchButton onClick={() => setView("login")}>로그인</AuthSwitchButton>
        </AuthSwitchRow>
      </AuthCard>
    </AuthContainer>
  );
};

export default Signup;
```

- [ ] **Step 2: Login.tsx prop 교체 + 비밀번호 찾기 링크**

`frontend/src/app/components/Login.tsx`에서:

1. import 추가: `import type { AuthView } from "./Signup";`
2. 컴포넌트 시그니처 교체:

```tsx
const Login = ({ setView }: { setView: (view: AuthView) => void }) => {
```

3. 하단 `AuthSwitchRow`를 다음으로 교체 (회원가입 전환 + 비밀번호 찾기 링크):

```tsx
        <AuthSwitchRow>
          <span>계정이 없으신가요?</span>
          <AuthSwitchButton onClick={() => setView("signup")}>회원가입</AuthSwitchButton>
        </AuthSwitchRow>
        <AuthSwitchRow>
          <AuthSwitchButton onClick={() => setView("reset")}>
            비밀번호를 잊으셨나요?
          </AuthSwitchButton>
        </AuthSwitchRow>
```

(styled 컴포넌트 export와 handleLogin 로직은 그대로 유지.)

- [ ] **Step 3: settings/page.tsx view 상태 도입**

`frontend/src/app/settings/page.tsx`에서:

1. import 추가: `import type { AuthView } from "../components/Signup";`
2. `const [isSignup, setIsSignup] = useState(false);` → `const [view, setView] = useState<AuthView>("login");`
3. 비로그인 분기 교체:

```tsx
  if (!user) {
    if (view === "signup") return <Signup setView={setView} />;
    return <Login setView={setView} />;
  }
```

(참고: `view === "reset"` 분기는 Task 9에서 `PasswordReset` 컴포넌트와 함께 추가한다. 이 시점에는 reset 선택 시 Login이 그대로 보여도 빌드는 통과한다.)
4. 로그아웃 버튼 onClick의 `setIsSignup(false)` → `setView("login")`.

- [ ] **Step 4: 빌드 확인**

Run: `cd frontend && pnpm build`
Expected: 타입 에러 없이 빌드 성공

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/components/Signup.tsx frontend/src/app/components/Login.tsx frontend/src/app/settings/page.tsx
git commit -m "feat: 회원가입을 이메일 인증 3단계 플로우로 개편"
```

---

### Task 9: 비밀번호 재설정 UI

**Files:**
- Create: `frontend/src/app/components/PasswordReset.tsx`
- Modify: `frontend/src/app/settings/page.tsx` (reset 분기 연결)

**Interfaces:**
- Consumes: Task 7 `EmailCodeVerification`, Task 8 `AuthView`, 백엔드 `POST /user/password-reset` (Task 6)
- Produces: `<PasswordReset setView />` — 인증 완료 후 새 비밀번호 폼, 성공 시 `setView('login')`

- [ ] **Step 1: PasswordReset.tsx 작성**

`frontend/src/app/components/PasswordReset.tsx`:

```tsx
"use client";

import { useState } from "react";
import { api } from "@/lib/axios";
import { useToast } from "./ui/Toast";
import EmailCodeVerification from "./EmailCodeVerification";
import type { AuthView } from "./Signup";
import {
  AuthCard,
  AuthContainer,
  AuthForm,
  AuthInput,
  AuthSubmitButton,
  AuthSwitchButton,
  AuthSwitchRow,
  AuthTitle,
} from "./Login";

const PasswordReset = ({ setView }: { setView: (view: AuthView) => void }) => {
  const [verified, setVerified] = useState(false);
  const [verificationToken, setVerificationToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { showToast } = useToast();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast("비밀번호가 일치하지 않습니다.", "error");
      return;
    }
    if (newPassword.length < 8) {
      showToast("비밀번호는 8자 이상이어야 합니다.", "error");
      return;
    }
    try {
      await api.post(`/user/password-reset`, { verificationToken, newPassword });
      showToast("비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.", "success");
      setView("login");
    } catch (error: any) {
      const message = error?.response?.data?.message;
      showToast(message || "비밀번호 변경에 실패했습니다. 다시 시도해주세요.", "error");
    }
  };

  return (
    <AuthContainer>
      <AuthCard>
        <AuthTitle>비밀번호 재설정</AuthTitle>
        {!verified ? (
          <EmailCodeVerification
            purpose="password_reset"
            submitLabel="인증 확인"
            onVerified={(_email, token) => {
              setVerificationToken(token);
              setVerified(true);
            }}
          />
        ) : (
          <AuthForm onSubmit={handleReset}>
            <AuthInput
              type="password"
              placeholder="새 비밀번호 (8자 이상)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <AuthInput
              type="password"
              placeholder="새 비밀번호 확인"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <AuthSubmitButton type="submit">비밀번호 변경</AuthSubmitButton>
          </AuthForm>
        )}
        <AuthSwitchRow>
          <AuthSwitchButton onClick={() => setView("login")}>
            로그인으로 돌아가기
          </AuthSwitchButton>
        </AuthSwitchRow>
      </AuthCard>
    </AuthContainer>
  );
};

export default PasswordReset;
```

- [ ] **Step 2: settings/page.tsx에 reset 분기 연결**

`frontend/src/app/settings/page.tsx`:

1. import 추가: `import PasswordReset from "../components/PasswordReset";`
2. 비로그인 분기 교체:

```tsx
  if (!user) {
    if (view === "signup") return <Signup setView={setView} />;
    if (view === "reset") return <PasswordReset setView={setView} />;
    return <Login setView={setView} />;
  }
```

- [ ] **Step 3: 빌드 확인**

Run: `cd frontend && pnpm build`
Expected: 빌드 성공

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/components/PasswordReset.tsx frontend/src/app/settings/page.tsx
git commit -m "feat: 이메일 인증 기반 비밀번호 재설정 화면 추가"
```

---

### Task 10: 계정 정보에 이름 표시·수정 (기존 유저 대응)

**Files:**
- Modify: `frontend/src/app/stores/useAuthStore.ts` (User 타입에 name)
- Modify: `frontend/src/app/components/Login.tsx` (setUser에 name 전달)
- Modify: `frontend/src/app/settings/page.tsx` (이름 InfoRow + 없으면 입력 폼)

**Interfaces:**
- Consumes: 백엔드 `PUT /user/:id` (JWT 가드, body `{ name }` — Task 5의 UpdateUserDto), 로그인 응답 `response.data.user.name`
- Produces: authStore `User.name?: string | null`

- [ ] **Step 1: authStore 타입 확장**

`frontend/src/app/stores/useAuthStore.ts`의 `User` 인터페이스에 추가:

```typescript
interface User {
  id: string;
  email: string;
  groupId: number;
  accessToken: string;
  role?: string;
  name?: string | null;
}
```

- [ ] **Step 2: 로그인 시 name 저장**

`frontend/src/app/components/Login.tsx`의 `setUser({...})` 호출에 한 줄 추가:

```tsx
      setUser({
        id: response.data.user.id,
        email: response.data.user.email,
        groupId: response.data.user.groupId,
        accessToken: response.data.accessToken,
        role: response.data.user.role,
        name: response.data.user.name ?? null,
      });
```

- [ ] **Step 3: 설정 페이지에 이름 표시·수정 추가**

`frontend/src/app/settings/page.tsx`:

1. 파일 상단 import에 `api` 추가: `import { api } from "@/lib/axios";`
2. 컴포넌트 안에 상태 추가 (`isDeleting` 아래):

```tsx
  const [nameInput, setNameInput] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const setUser = useAuthStore((state) => state.setUser);
```

3. 핸들러 추가 (`handleDeleteGroup` 아래):

```tsx
  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || !user || isSavingName) return;
    setIsSavingName(true);
    try {
      await api.put(`/user/${user.id}`, { name: trimmed });
      setUser({ ...user, name: trimmed });
      showToast("이름이 저장되었습니다.", "success");
    } catch {
      showToast("이름 저장에 실패했습니다. 잠시 후 다시 시도해주세요.", "error");
    } finally {
      setIsSavingName(false);
    }
  };
```

4. JSX — `아이디` InfoRow 위에 이름 행 추가:

```tsx
        <InfoRow>
          <InfoLabel>이름</InfoLabel>
          {user.name ? (
            <InfoValue>{user.name}</InfoValue>
          ) : (
            <NameEditRow>
              <NameInput
                type="text"
                placeholder="이름 입력"
                value={nameInput}
                maxLength={30}
                onChange={(e) => setNameInput(e.target.value)}
              />
              <NameSaveButton onClick={handleSaveName} disabled={isSavingName}>
                저장
              </NameSaveButton>
            </NameEditRow>
          )}
        </InfoRow>
```

5. styled 컴포넌트 추가 (기존 styled 정의 아래):

```tsx
const NameEditRow = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const NameInput = styled.input`
  width: 9rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  font-size: 0.875rem;
`;

const NameSaveButton = styled.button`
  padding: 0.375rem 0.75rem;
  border-radius: 0.375rem;
  background: var(--primary-color);
  color: white;
  font-weight: 600;
  font-size: 0.8125rem;

  &:disabled {
    opacity: 0.6;
  }
`;
```

- [ ] **Step 4: 빌드 확인**

Run: `cd frontend && pnpm build`
Expected: 빌드 성공

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/stores/useAuthStore.ts frontend/src/app/components/Login.tsx frontend/src/app/settings/page.tsx
git commit -m "feat: 계정 정보에 이름 표시 및 기존 유저 이름 입력 지원"
```

---

### Task 11: 엔드투엔드 검증 + 문서·환경 변수 정리

**Files:**
- Modify: `CLAUDE.md` (환경 변수 문단)
- Modify: `backend/.env.dev` (로컬 파일 — git 미추적이면 커밋 없음)

**Interfaces:**
- Consumes: 전체 태스크 결과물
- Produces: 검증 완료된 전체 플로우, 갱신된 문서

- [ ] **Step 1: 백엔드 전체 테스트·린트**

Run: `cd backend && pnpm test && pnpm lint && pnpm build`
Expected: 전체 PASS, 린트 통과, 빌드 성공

- [ ] **Step 2: 로컬 전체 스택으로 수동 검증**

```bash
docker compose up -d db
cd backend && pnpm dev     # 셸 1
cd frontend && pnpm dev    # 셸 2
```

`http://localhost:3011/settings`에서 확인:

1. **가입**: 회원가입 → 이메일 입력 → 발송 → 백엔드 콘솔에서 `[dev] ... signup 인증 코드: NNNNNN` 확인 → 코드 입력 → 이름/비밀번호(8자 이상)/그룹명 입력 → 가입 완료 토스트.
2. **가입 방어**: 같은 이메일로 재차 코드 요청 시 "이미 가입된 이메일입니다.", 60초 내 재발송 시 "잠시 후 다시 시도해주세요.", 틀린 코드 5회 시 시도 초과 메시지.
3. **로그인**: 새 계정으로 로그인 → 설정에 이름 표시 확인.
4. **비밀번호 재설정**: 로그아웃 → "비밀번호를 잊으셨나요?" → 코드 인증 → 새 비밀번호 → 새 비밀번호로 로그인 성공, 이전 비밀번호 실패.
5. **기존 유저**: 마이그레이션 전 생성된 계정으로 로그인 → 이름 InfoRow에 입력 폼 → 저장 → 표시 전환.

Expected: 5개 시나리오 모두 통과. 실패 시 해당 태스크로 돌아가 수정 후 재검증.

- [ ] **Step 3: CLAUDE.md 환경 변수 문단 갱신**

`CLAUDE.md`의 "환경 변수" 섹션에서 백엔드 키 목록 문장을 다음으로 교체:

```markdown
- 백엔드는 `.env.${NODE_ENV}`를 로드한다 (`backend/`의 `.env.dev`, `.env.development`, `.env.prod`). 키: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`, `PORT`, `JWT_SECRET`, `MAIL_FROM`, `AWS_REGION`. `MAIL_FROM`이 없으면 인증 메일은 실발송 대신 콘솔 로그로 대체된다(dev 폴백) — 운영에는 반드시 설정할 것. SES 자격증명은 EC2 IAM Role을 사용한다.
```

- [ ] **Step 4: 로컬 .env.dev 안내**

`backend/.env.dev`에는 `MAIL_FROM`을 **설정하지 않는다** (dev 폴백 사용). 운영 `.env.prod`에 배포 시 `MAIL_FROM=no-reply@dngg.one`, `AWS_REGION=<SES 리전>`을 추가해야 한다 — 이는 배포 작업이므로 여기서는 CLAUDE.md 기록으로 대신한다.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: 메일 발송 환경 변수(MAIL_FROM, AWS_REGION) 문서화"
```

---

## 배포 체크리스트 (구현 완료 후, 코드 밖 작업)

1. AWS SES: dngg.one 도메인 자격 증명 생성, DKIM/SPF DNS 레코드 등록, 샌드박스 해제 요청.
2. EC2 인스턴스 IAM Role에 `ses:SendEmail` 권한 부여.
3. 운영 `.env.prod`에 `MAIL_FROM`, `AWS_REGION` 추가.
4. **백엔드·프론트 이미지를 함께 재빌드·배포** (구버전 프론트 가입 요청은 새 백엔드에서 400).
5. 배포 직후 운영에서 가입 1건·비밀번호 재설정 1건 실제 수행해 SES 발송 확인.
