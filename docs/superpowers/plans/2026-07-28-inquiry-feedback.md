# 문의·피드백 경로 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 사용자가 앱 안에서 문의·피드백을 남기면 DB에 저장되고, 관리자가 `/admin`에서 답변을 입력하면 SES로 작성자에게 회신 메일이 나가는 경로를 만든다.

**Architecture:** 백엔드에 신규 `inquiry` 모듈(엔티티 1개 + 사용자용/관리자용 컨트롤러 2개 + 서비스 1개)을 추가한다. 답변 저장과 메일 발송은 `dataSource.transaction` 한 블록 안에서 수행해, 발송 실패 시 UPDATE가 롤백되고 문의가 `pending`으로 남게 한다. 기존 `MailService`에서 SES 클라이언트 생성·`MAIL_FROM` 폴백을 private `send()`로 추출해 인증 메일과 회신 메일이 공유한다. 프론트는 신규 `/inquiry` 폼 페이지, `/settings` 진입 버튼, `/admin` 문의 카드 세 곳을 건드린다.

**Tech Stack:** NestJS 11 + TypeORM(Postgres 15) + Jest / Next.js 14 App Router + styled-components + TanStack Query. 패키지 매니저 pnpm.

**설계 문서:** `docs/superpowers/specs/2026-07-28-inquiry-feedback-design.md`

## Global Constraints

- 커밋 메시지 제목·본문은 **한글**, conventional 타입 접두어는 영문(`feat:`, `test:`, `refactor:`, `docs:`).
- **`Inquiry.user`에 FK를 걸지 않는다.** `createForeignKeyConstraints: false` + `nullable: true`. `UserService.deleteUser`가 하드 삭제라 FK를 걸면 문의를 남긴 사용자의 탈퇴가 실패한다. 이 relation을 다루는 코드는 전부 null-safe여야 한다.
- **`authorEmail`·`userId`·`status`는 클라이언트 입력을 받지 않는다.** 서버가 `req.user` 또는 상수에서 채운다. DTO에 필드를 만들지 않는 것으로 전역 `ValidationPipe`(`whitelist` + `forbidNonWhitelisted`)가 자동 차단한다.
- **불변식: `status === 'answered'`이면 회신 메일이 실제로 발송되었다.** 답변 UPDATE와 메일 발송은 같은 트랜잭션 안에 있어야 한다.
- 상태·유형은 문자열 리터럴 유니온으로 둔다 — **TypeScript `enum` 금지** (`subscription.constants.ts` 관행).
- 길이 제한: `content` 최대 **2000자**, `answer` 최대 **5000자**.
- 회신 메일 제목은 정확히 `[dn.gg] 문의하신 내용에 답변드립니다`.
- `MAIL_FROM` 미설정(dev)은 **발송 실패로 보지 않는다** — 로그 폴백 후 정상 반환.
- 백엔드 테스트: `cd backend && pnpm test -- <파일경로>`. 전체는 `cd backend && pnpm test`.
- **`backend/pnpm lint`는 `eslint --fix`라 레포 전체를 수정한다** — 검증에는 `pnpm build`를 쓴다.
- **`frontend/pnpm lint`를 실행하지 말 것.** ESLint 설정이 인식되지 않아 대화형 설정 프롬프트로 빠져 멈춘다(2026-07-19 브랜치부터 알려진 문제). 프론트 검증은 **`pnpm build`만** 쓴다.
- 프론트엔드는 이 프로젝트에 테스트 인프라가 없다 — 단위 테스트를 새로 도입하지 않고 `pnpm build` + 수동 스모크로 확인한다.
- `synchronize: true`라 `Inquiry` 테이블은 백엔드 재시작 시 자동 생성된다. **마이그레이션 파일을 만들지 않는다.**
- 프론트 API 호출은 `@/lib/axios`의 `api`만 쓴다. `src/app/lib/axios.ts`는 레거시 중복 파일 — import 금지.

---

### Task 1: 상수 · 엔티티 · 요청 DTO

**Files:**
- Create: `backend/src/modules/inquiry/inquiry.constants.ts`
- Create: `backend/src/entities/Inquiry.entity.ts`
- Create: `backend/src/modules/inquiry/inquiry.request.dto.ts`
- Test: `backend/src/modules/inquiry/inquiry.request.dto.spec.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `inquiry.constants.ts` — `type InquiryType = 'bug' | 'feature' | 'billing' | 'etc'`, `type InquiryStatus = 'pending' | 'answered'`, `const INQUIRY_TYPES: InquiryType[]`, `const INQUIRY_STATUSES: InquiryStatus[]`, `const INQUIRY_TYPE_LABELS: Record<InquiryType, string>`
  - `Inquiry.entity.ts` — `class Inquiry { id: number; userId: number | null; user: User | null; authorEmail: string; type: InquiryType; content: string; status: InquiryStatus; answer: string | null; answeredAt: Date | null; createdAt: Date; updatedAt: Date }`
  - `inquiry.request.dto.ts` — `class CreateInquiryDto { type: InquiryType; content: string }`, `class AnswerInquiryDto { answer: string }`, `class ListInquiryQueryDto { status?: InquiryStatus }`

- [ ] **Step 1: 상수 파일 작성**

Create `backend/src/modules/inquiry/inquiry.constants.ts`:

```ts
export type InquiryType = 'bug' | 'feature' | 'billing' | 'etc';

export type InquiryStatus = 'pending' | 'answered';

// DTO의 @IsIn과 엔티티 타입이 갈라지지 않도록 배열을 단일 출처로 둔다.
export const INQUIRY_TYPES: InquiryType[] = [
  'bug',
  'feature',
  'billing',
  'etc',
];

export const INQUIRY_STATUSES: InquiryStatus[] = ['pending', 'answered'];

// 회신 메일 본문에 쓰는 한글 라벨
export const INQUIRY_TYPE_LABELS: Record<InquiryType, string> = {
  bug: '버그 신고',
  feature: '기능 제안',
  billing: '결제·구독',
  etc: '기타',
};
```

- [ ] **Step 2: 엔티티 작성**

Create `backend/src/entities/Inquiry.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './User.entity';
import {
  InquiryStatus,
  InquiryType,
} from '../modules/inquiry/inquiry.constants';

@Entity()
export class Inquiry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int', { nullable: true })
  userId: number | null;

  // FK를 걸지 않는다 — UserService.deleteUser가 하드 삭제라 FK가 있으면
  // 문의를 남긴 사용자의 탈퇴가 제약 위반으로 실패한다.
  // Log.player·InGamePlayer.player와 같은 관행. 탈퇴 후에도 문의 이력은 보존된다.
  @ManyToOne(() => User, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'userId', referencedColumnName: 'id' })
  user: User | null;

  // 작성 시점 스냅샷 — 회신 메일은 user.email이 아니라 이 값으로 보낸다.
  // 탈퇴해서 user가 null이 된 문의에도 답장할 수 있다.
  @Column('varchar')
  authorEmail: string;

  @Column('varchar')
  type: InquiryType;

  @Column('text')
  content: string;

  @Column('varchar', { default: 'pending' })
  status: InquiryStatus;

  @Column('text', { nullable: true })
  answer: string | null;

  @Column('timestamp', { nullable: true })
  answeredAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 3: 실패하는 DTO 테스트 작성**

Create `backend/src/modules/inquiry/inquiry.request.dto.spec.ts`:

```ts
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  AnswerInquiryDto,
  CreateInquiryDto,
  ListInquiryQueryDto,
} from './inquiry.request.dto';

describe('CreateInquiryDto', () => {
  test('허용된 type과 내용이 있으면 통과한다', async () => {
    const dto = plainToInstance(CreateInquiryDto, {
      type: 'bug',
      content: '기록 화면에서 버튼이 가려집니다.',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  test('허용되지 않은 type은 거부한다', async () => {
    const dto = plainToInstance(CreateInquiryDto, {
      type: 'spam',
      content: '내용',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  test('빈 content는 거부한다', async () => {
    const dto = plainToInstance(CreateInquiryDto, { type: 'etc', content: '' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'content')).toBe(true);
  });

  test('2000자를 넘는 content는 거부한다', async () => {
    const dto = plainToInstance(CreateInquiryDto, {
      type: 'etc',
      content: 'a'.repeat(2001),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'content')).toBe(true);
  });

  test('2000자 content는 통과한다 (경계값)', async () => {
    const dto = plainToInstance(CreateInquiryDto, {
      type: 'etc',
      content: 'a'.repeat(2000),
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});

describe('AnswerInquiryDto', () => {
  test('빈 answer는 거부한다', async () => {
    const dto = plainToInstance(AnswerInquiryDto, { answer: '' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'answer')).toBe(true);
  });

  test('5000자를 넘는 answer는 거부한다', async () => {
    const dto = plainToInstance(AnswerInquiryDto, { answer: 'a'.repeat(5001) });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'answer')).toBe(true);
  });
});

describe('ListInquiryQueryDto', () => {
  test('status가 없어도 통과한다', async () => {
    const dto = plainToInstance(ListInquiryQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  test('허용된 status는 통과한다', async () => {
    const dto = plainToInstance(ListInquiryQueryDto, { status: 'pending' });
    expect(await validate(dto)).toHaveLength(0);
  });

  test('허용되지 않은 status는 거부한다', async () => {
    const dto = plainToInstance(ListInquiryQueryDto, { status: 'DROP TABLE' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });
});
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `cd backend && pnpm test -- src/modules/inquiry/inquiry.request.dto.spec.ts`
Expected: FAIL — `Cannot find module './inquiry.request.dto'`

- [ ] **Step 5: DTO 구현**

Create `backend/src/modules/inquiry/inquiry.request.dto.ts`:

```ts
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  INQUIRY_STATUSES,
  INQUIRY_TYPES,
  InquiryStatus,
  InquiryType,
} from './inquiry.constants';

// authorEmail·userId·status는 의도적으로 없다.
// 전역 ValidationPipe가 whitelist + forbidNonWhitelisted라, 클라이언트가
// 이 값들을 밀어넣으려는 시도는 여기서 400으로 차단된다.
export class CreateInquiryDto {
  @IsIn(INQUIRY_TYPES)
  type: InquiryType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}

export class AnswerInquiryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  answer: string;
}

// 쿼리 파라미터도 전역 ValidationPipe를 탄다. DTO가 없으면 임의 문자열이
// 그대로 where 절에 들어가므로 반드시 @IsIn으로 막는다.
export class ListInquiryQueryDto {
  @IsOptional()
  @IsIn(INQUIRY_STATUSES)
  status?: InquiryStatus;
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `cd backend && pnpm test -- src/modules/inquiry/inquiry.request.dto.spec.ts`
Expected: PASS — 10 tests passed

- [ ] **Step 7: 빌드 확인**

Run: `cd backend && pnpm build`
Expected: 에러 없이 종료 (exit 0). 엔티티가 `InquiryType`을 올바르게 참조하는지 여기서 잡힌다.

- [ ] **Step 8: 커밋**

```bash
cd /Users/onady/project/dngg
git add backend/src/modules/inquiry/inquiry.constants.ts \
        backend/src/modules/inquiry/inquiry.request.dto.ts \
        backend/src/modules/inquiry/inquiry.request.dto.spec.ts \
        backend/src/entities/Inquiry.entity.ts
git commit -m "feat: 문의 엔티티·상수·요청 DTO 추가

Inquiry.user는 FK 없이(createForeignKeyConstraints: false) 두고
authorEmail 스냅샷을 따로 저장한다. deleteUser가 하드 삭제라
FK를 걸면 문의를 남긴 사용자의 탈퇴가 실패하기 때문이다."
```

---

### Task 2: MailService — `send` 추출 + 회신 메일

**Files:**
- Modify: `backend/src/modules/mail/mail.service.ts`
- Test: `backend/src/modules/mail/mail.service.spec.ts` (기존 파일에 케이스 추가)

**Interfaces:**
- Consumes: Task 1의 `InquiryType`, `INQUIRY_TYPE_LABELS` (`../inquiry/inquiry.constants`)
- Produces:
  - `buildInquiryAnswerMail(type: InquiryType, content: string, answer: string): { subject: string; body: string }` — export된 순수 함수
  - `MailService.sendInquiryAnswer(to: string, type: InquiryType, content: string, answer: string): Promise<void>`
  - private `MailService.send(to: string, subject: string, body: string): Promise<void>` — `MAIL_FROM` 미설정 시 로그만 남기고 정상 반환

- [ ] **Step 1: 실패하는 테스트 추가**

`backend/src/modules/mail/mail.service.spec.ts`의 import 줄을 다음으로 교체한다:

```ts
import { SendEmailCommand } from '@aws-sdk/client-ses';
import {
  buildInquiryAnswerMail,
  buildVerificationMail,
  MailService,
} from './mail.service';
```

그리고 파일 맨 아래 `describe('MailService', () => { ... })` 블록 **안쪽 끝**(마지막 `});` 두 개 사이)에 다음 두 describe를 추가한다:

```ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pnpm test -- src/modules/mail/mail.service.spec.ts`
Expected: FAIL — `buildInquiryAnswerMail is not a function` / `service.sendInquiryAnswer is not a function`

- [ ] **Step 3: MailService 구현**

`backend/src/modules/mail/mail.service.ts` 전체를 다음으로 교체한다:

```ts
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
```

주의: dev 폴백 로그 문구가 바뀌지만 본문(`body`)이 로그에 포함되므로, 기존 테스트의 `expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('123456'))`은 그대로 통과한다.

- [ ] **Step 4: 테스트 통과 확인 (기존 케이스 회귀 포함)**

Run: `cd backend && pnpm test -- src/modules/mail/mail.service.spec.ts`
Expected: PASS — 기존 4개 + 신규 5개 모두 통과. 특히 `MAIL_FROM 미설정이면 SES 호출 없이 코드를 로그로 남긴다 (dev 폴백)`와 `MAIL_FROM 설정 시 SES로 올바른 파라미터의 SendEmailCommand를 보낸다`가 여전히 초록이어야 한다.

- [ ] **Step 5: 인증 메일 사용처 회귀 확인**

Run: `cd backend && pnpm test -- src/modules/user`
Expected: PASS — `user-signup.spec.ts`, `password-reset.spec.ts` 등 기존 케이스 전부 통과

- [ ] **Step 6: 커밋**

```bash
cd /Users/onady/project/dngg
git add backend/src/modules/mail/mail.service.ts \
        backend/src/modules/mail/mail.service.spec.ts
git commit -m "refactor: MailService에 send 추출하고 문의 회신 메일 추가

SES 클라이언트 생성과 MAIL_FROM 폴백이 sendVerificationCode 안에
묻혀 있던 것을 private send로 빼내 sendInquiryAnswer와 공유한다.
회신 메일 본문에는 원문 문의 내용을 함께 싣는다."
```

---

### Task 3: InquiryService — 접수 · 목록 · 답변 트랜잭션

**Files:**
- Create: `backend/src/modules/inquiry/inquiry.service.ts`
- Test: `backend/src/modules/inquiry/inquiry.service.spec.ts`

**Interfaces:**
- Consumes: Task 1의 `Inquiry` 엔티티·`InquiryStatus`·`CreateInquiryDto`·`AnswerInquiryDto`, Task 2의 `MailService.sendInquiryAnswer`
- Produces:
  - `interface InquiryAdminRow { id: number; type: InquiryType; content: string; authorEmail: string; status: InquiryStatus; answer: string | null; answeredAt: Date | null; createdAt: Date }`
  - `InquiryService` 생성자 시그니처: `(inquiryRepo: Repository<Inquiry>, mailService: MailService, dataSource: DataSource)` — **테스트가 이 순서에 의존한다**
  - `create(author: { userId: number; email: string }, dto: CreateInquiryDto): Promise<{ id: number; createdAt: Date }>`
  - `list(status?: InquiryStatus): Promise<InquiryAdminRow[]>`
  - `answer(id: number, dto: AnswerInquiryDto, now: Date): Promise<{ id: number; status: InquiryStatus; answeredAt: Date }>`

- [ ] **Step 1: 실패하는 테스트 작성**

Create `backend/src/modules/inquiry/inquiry.service.spec.ts`:

```ts
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pnpm test -- src/modules/inquiry/inquiry.service.spec.ts`
Expected: FAIL — `Cannot find module './inquiry.service'`

- [ ] **Step 3: 서비스 구현**

Create `backend/src/modules/inquiry/inquiry.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Inquiry } from 'src/entities/Inquiry.entity';
import { MailService } from '../mail/mail.service';
import { InquiryStatus, InquiryType } from './inquiry.constants';
import { AnswerInquiryDto, CreateInquiryDto } from './inquiry.request.dto';

// 관리자 전용 응답 — authorEmail을 포함한다.
export interface InquiryAdminRow {
  id: number;
  type: InquiryType;
  content: string;
  authorEmail: string;
  status: InquiryStatus;
  answer: string | null;
  answeredAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class InquiryService {
  constructor(
    @InjectRepository(Inquiry)
    private readonly inquiryRepo: Repository<Inquiry>,
    private readonly mailService: MailService,
    private readonly dataSource: DataSource,
  ) {}

  // authorEmail·userId·status는 클라이언트 입력이 아니라 서버가 채운다.
  async create(
    author: { userId: number; email: string },
    dto: CreateInquiryDto,
  ): Promise<{ id: number; createdAt: Date }> {
    const saved = await this.inquiryRepo.save(
      this.inquiryRepo.create({
        userId: author.userId,
        authorEmail: author.email,
        type: dto.type,
        content: dto.content,
        status: 'pending',
      }),
    );
    return { id: saved.id, createdAt: saved.createdAt };
  }

  async list(status?: InquiryStatus): Promise<InquiryAdminRow[]> {
    const rows = await this.inquiryRepo.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      content: row.content,
      authorEmail: row.authorEmail,
      status: row.status,
      answer: row.answer,
      answeredAt: row.answeredAt,
      createdAt: row.createdAt,
    }));
  }

  // 답변 저장과 회신 메일 발송을 한 트랜잭션에 묶는다.
  // 발송이 실패하면 UPDATE가 롤백되어 status는 pending으로 남는다.
  // 불변식: status === 'answered' 이면 회신 메일이 실제로 발송되었다.
  // 재답변은 허용한다 — 덮어쓰고 메일을 다시 보내는 것이 곧 재시도 경로다.
  async answer(
    id: number,
    dto: AnswerInquiryDto,
    now: Date,
  ): Promise<{ id: number; status: InquiryStatus; answeredAt: Date }> {
    return this.dataSource.transaction(async (manager) => {
      const inquiry = await manager.findOne(Inquiry, { where: { id } });
      if (!inquiry) {
        throw new NotFoundException('문의를 찾을 수 없습니다.');
      }

      await manager.update(Inquiry, id, {
        answer: dto.answer,
        answeredAt: now,
        status: 'answered',
      });

      // user relation이 아니라 작성 시점 스냅샷으로 보낸다 (탈퇴 사용자 대응).
      await this.mailService.sendInquiryAnswer(
        inquiry.authorEmail,
        inquiry.type,
        inquiry.content,
        dto.answer,
      );

      return { id, status: 'answered' as InquiryStatus, answeredAt: now };
    });
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && pnpm test -- src/modules/inquiry/inquiry.service.spec.ts`
Expected: PASS — 9 tests passed (create 2 + list 2 + answer 5). 특히 `메일 발송이 실패하면 롤백되어 pending으로 남는다`가 초록인지 확인할 것.

- [ ] **Step 5: 커밋**

```bash
cd /Users/onady/project/dngg
git add backend/src/modules/inquiry/inquiry.service.ts \
        backend/src/modules/inquiry/inquiry.service.spec.ts
git commit -m "feat: 문의 접수·조회·답변 서비스 추가

답변 저장과 회신 메일 발송을 한 트랜잭션에 묶어, 발송 실패 시
롤백되어 pending으로 남게 한다. 관리자는 답변했다고 생각하는데
사용자는 받지 못하는 조용한 실패를 구조적으로 막는다."
```

---

### Task 4: 컨트롤러 · 모듈 등록

**Files:**
- Create: `backend/src/modules/inquiry/inquiry.controller.ts`
- Create: `backend/src/modules/inquiry/inquiry-admin.controller.ts`
- Create: `backend/src/modules/inquiry/inquiry.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: Task 1의 DTO들, Task 3의 `InquiryService`, 기존 `AdminGuard`(`../admin/admin.guard`), 기존 `MailModule`(`../mail/mail.module`)
- Produces: HTTP 경로 3개 — `POST /inquiry`, `GET /admin/inquiries`, `POST /admin/inquiries/:id/answer`

- [ ] **Step 1: 사용자용 컨트롤러 작성**

Create `backend/src/modules/inquiry/inquiry.controller.ts`:

```ts
import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InquiryService } from './inquiry.service';
import { CreateInquiryDto } from './inquiry.request.dto';

@Controller('inquiry')
@UseGuards(AuthGuard('jwt'))
export class InquiryController {
  constructor(private readonly inquiryService: InquiryService) {}

  @Post()
  create(@Request() req, @Body() dto: CreateInquiryDto) {
    return this.inquiryService.create(
      { userId: req.user.userId, email: req.user.email },
      dto,
    );
  }
}
```

- [ ] **Step 2: 관리자용 컨트롤러 작성**

Create `backend/src/modules/inquiry/inquiry-admin.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from '../admin/admin.guard';
import { InquiryService } from './inquiry.service';
import {
  AnswerInquiryDto,
  ListInquiryQueryDto,
} from './inquiry.request.dto';

// URL은 기존 /admin/* 규칙에 맞추고, 코드는 inquiry 모듈에 응집시킨다.
// AdminController는 클래스 전체에 AdminGuard가 걸려 있어 사용자 작성 경로를
// 넣을 수 없고, 문의 로직을 AdminService로 옮기면 응집도가 깨진다.
@Controller('admin/inquiries')
@UseGuards(AuthGuard('jwt'), AdminGuard)
export class InquiryAdminController {
  constructor(private readonly inquiryService: InquiryService) {}

  @Get()
  list(@Query() query: ListInquiryQueryDto) {
    return this.inquiryService.list(query.status);
  }

  @Post(':id/answer')
  answer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnswerInquiryDto,
  ) {
    return this.inquiryService.answer(id, dto, new Date());
  }
}
```

- [ ] **Step 3: 모듈 작성**

Create `backend/src/modules/inquiry/inquiry.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inquiry } from 'src/entities/Inquiry.entity';
import { MailModule } from '../mail/mail.module';
import { AdminGuard } from '../admin/admin.guard';
import { InquiryController } from './inquiry.controller';
import { InquiryAdminController } from './inquiry-admin.controller';
import { InquiryService } from './inquiry.service';

@Module({
  imports: [TypeOrmModule.forFeature([Inquiry]), MailModule],
  controllers: [InquiryController, InquiryAdminController],
  // AdminGuard는 무상태(의존성 없음)라 여기에 등록해 재사용한다.
  providers: [InquiryService, AdminGuard],
})
export class InquiryModule {}
```

- [ ] **Step 4: app.module.ts에 등록**

`backend/src/app.module.ts`의 import 목록에서 이 줄 아래에

```ts
import { AdminModule } from './modules/admin/admin.module';
```

다음 줄을 추가한다:

```ts
import { InquiryModule } from './modules/inquiry/inquiry.module';
```

그리고 `imports` 배열의 `AdminModule,` 다음 줄에 추가한다:

```ts
    AdminModule,
    InquiryModule,
```

- [ ] **Step 5: 빌드 및 전체 테스트**

Run: `cd backend && pnpm build && pnpm test`
Expected: 빌드 exit 0, 전체 테스트 스위트 PASS

- [ ] **Step 6: 로컬 부팅 스모크**

Run:

```bash
cd /Users/onady/project/dngg
docker compose up -d db
cd backend && pnpm dev
```

Expected: 부팅 로그에 `InquiryController {/inquiry}`, `InquiryAdminController {/admin/inquiries}` 라우트 매핑이 찍히고, `synchronize: true`가 `inquiry` 테이블을 만든다. 다른 터미널에서 확인:

```bash
docker compose exec db psql -U postgres -d dngg -c '\d inquiry'
```

Expected: `id, userId, authorEmail, type, content, status, answer, answeredAt, createdAt, updatedAt` 컬럼이 보이고 **`userId`에 FOREIGN KEY 제약이 없다.**

- [ ] **Step 7: 인증 가드 스모크**

Run (백엔드가 떠 있는 상태에서):

```bash
curl -i -X POST http://localhost:3010/inquiry \
  -H 'Content-Type: application/json' \
  -d '{"type":"bug","content":"테스트"}'
```

Expected: `401 Unauthorized` (토큰 없음)

```bash
curl -i -X POST http://localhost:3010/inquiry \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"type":"bug","content":"테스트","authorEmail":"attacker@evil.com"}'
```

(`$TOKEN`은 로컬 로그인 후 브라우저 `localStorage.token` 값)
Expected: `400 Bad Request` — `property authorEmail should not exist`. whitelist 차단이 동작하는지 확인하는 것이 요점이다.

- [ ] **Step 8: 커밋**

```bash
cd /Users/onady/project/dngg
git add backend/src/modules/inquiry/inquiry.controller.ts \
        backend/src/modules/inquiry/inquiry-admin.controller.ts \
        backend/src/modules/inquiry/inquiry.module.ts \
        backend/src/app.module.ts
git commit -m "feat: 문의 접수·관리 API 엔드포인트 추가

사용자용 POST /inquiry와 관리자용 GET·POST /admin/inquiries를
한 모듈에 두되 컨트롤러를 분리했다. AdminController는 클래스 전체에
AdminGuard가 걸려 있어 사용자 작성 경로를 넣을 수 없다."
```

---

### Task 5: 문의 폼 페이지 + `/settings` 진입점

**Files:**
- Create: `frontend/src/app/inquiry/page.tsx`
- Modify: `frontend/src/app/settings/page.tsx:258-265` (구독 관리 버튼 영역)

**Interfaces:**
- Consumes: Task 4의 `POST /inquiry` — 요청 `{ type: 'bug'|'feature'|'billing'|'etc', content: string }`, 응답 `{ id, createdAt }`
- Produces: `/inquiry` 라우트

**설계 문서와의 의도적 차이:** 스펙은 전송 성공 시 `setPendingToast`를 쓰라고 했지만, `consumePendingToast`는 `ToastProvider` 마운트 시점(전체 리로드)에만 실행된다(`frontend/src/app/components/ui/Toast.tsx:79`). `router.push`는 클라이언트 내비게이션이라 프로바이더가 재마운트되지 않아 토스트가 영영 표시되지 않는다. 따라서 `showToast` → `router.push` 순서로 간다. 프로바이더가 이동 후에도 살아 있으므로 토스트는 그대로 보인다 (헤더의 `handleLockedMenuClick`과 같은 방식).

- [ ] **Step 1: 문의 폼 페이지 작성**

Create `frontend/src/app/inquiry/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { api } from "@/lib/axios";
import { useAuthStore } from "@/app/stores/useAuthStore";
import { useToast } from "@/app/components/ui/Toast";
import { useMounted } from "@/app/lib/useMounted";

const MAX_CONTENT = 2000;

const TYPE_OPTIONS = [
  { value: "bug", label: "버그 신고" },
  { value: "feature", label: "기능 제안" },
  { value: "billing", label: "결제·구독 문의" },
  { value: "etc", label: "기타" },
];

const Container = styled.div`
  max-width: 480px;
  margin: calc(var(--header-height) + 28px) auto 0;
  padding: 0 1rem;
`;

const Card = styled.div`
  background: white;
  border: 1px solid var(--border-color);
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
`;

const Title = styled.h2`
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
`;

const Desc = styled.p`
  font-size: 0.875rem;
  color: #6b7280;
  line-height: 1.5;
  margin-bottom: 1.25rem;
`;

const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.375rem;
`;

const Select = styled.select`
  width: 100%;
  padding: 0.625rem 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  font-size: 0.9375rem;
  background: white;
  margin-bottom: 1rem;
`;

const Textarea = styled.textarea`
  width: 100%;
  min-height: 9rem;
  padding: 0.625rem 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  font-size: 0.9375rem;
  font-family: inherit;
  line-height: 1.5;
  resize: vertical;
`;

const Counter = styled.div`
  text-align: right;
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 0.25rem;
`;

const SubmitButton = styled.button`
  width: 100%;
  margin-top: 1rem;
  padding: 0.625rem;
  border-radius: 0.375rem;
  background: var(--primary-color);
  color: white;
  font-weight: 600;
  font-size: 0.9375rem;

  &:hover {
    background: var(--hover-color);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const CancelButton = styled.button`
  width: 100%;
  margin-top: 0.5rem;
  padding: 0.625rem;
  border-radius: 0.375rem;
  background: #f3f4f6;
  color: var(--text-color);
  font-weight: 600;
  font-size: 0.9375rem;

  &:hover {
    background: #e5e7eb;
  }
`;

const InquiryPage = () => {
  const router = useRouter();
  const mounted = useMounted();
  const { user } = useAuthStore((state) => state);
  const { showToast } = useToast();
  const [type, setType] = useState("bug");
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);

  // 비로그인 직접 접근 — 헤더의 handleLockedMenuClick과 같은 처리
  useEffect(() => {
    if (mounted && !user) {
      showToast("로그인 후 이용할 수 있습니다.", "info");
      router.replace("/settings");
    }
  }, [mounted, user, router, showToast]);

  if (!mounted || !user) return null;

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    try {
      await api.post("/inquiry", { type, content: trimmed });
      showToast(
        "문의가 접수되었습니다. 답변은 가입하신 이메일로 보내드립니다.",
        "success",
      );
      router.push("/settings");
    } catch {
      showToast(
        "문의 전송에 실패했습니다. 잠시 후 다시 시도해주세요.",
        "error",
      );
      setIsSending(false);
    }
  };

  return (
    <Container>
      <Card>
        <Title>문의·피드백</Title>
        <Desc>
          버그 제보나 기능 제안을 남겨주세요. 답변은 가입하신 이메일(
          {user.email})로 보내드립니다.
        </Desc>

        <Label htmlFor="inquiry-type">문의 유형</Label>
        <Select
          id="inquiry-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Label htmlFor="inquiry-content">내용</Label>
        <Textarea
          id="inquiry-content"
          value={content}
          maxLength={MAX_CONTENT}
          placeholder="어떤 상황에서 무슨 일이 있었는지 적어주시면 확인에 큰 도움이 됩니다."
          onChange={(e) => setContent(e.target.value)}
        />
        <Counter>
          {content.length} / {MAX_CONTENT}
        </Counter>

        <SubmitButton
          onClick={handleSubmit}
          disabled={isSending || !content.trim()}
        >
          {isSending ? "전송 중..." : "보내기"}
        </SubmitButton>
        <CancelButton onClick={() => router.push("/settings")}>
          취소
        </CancelButton>
      </Card>
    </Container>
  );
};

export default InquiryPage;
```

- [ ] **Step 2: `/settings`에 진입 버튼 추가**

`frontend/src/app/settings/page.tsx`에서 다음 블록을

```tsx
        <SubscriptionButton onClick={() => router.push("/subscription")}>
          구독 관리
        </SubscriptionButton>
```

이렇게 바꾼다:

```tsx
        <SubscriptionButton onClick={() => router.push("/subscription")}>
          구독 관리
        </SubscriptionButton>
        <SubscriptionButton onClick={() => router.push("/inquiry")}>
          문의·피드백
        </SubscriptionButton>
```

이 영역은 `if (!user)` 분기 아래라 로그인 가드가 자동으로 걸린다.

- [ ] **Step 3: 빌드 확인**

Run: `cd frontend && pnpm build`
Expected: exit 0. (`pnpm lint`은 실행하지 말 것 — 대화형 프롬프트로 멈춘다)

- [ ] **Step 4: 수동 스모크**

백엔드(`:3010`)와 프론트(`:3011`)를 띄운 상태에서:

1. 로그아웃 상태로 `http://localhost:3011/inquiry` 직접 접근 → `/settings`로 리다이렉트되고 "로그인 후 이용할 수 있습니다." 토스트
2. 로그인 후 `/settings` → `문의·피드백` 버튼이 `구독 관리` 아래에 보임 → 클릭 → `/inquiry`
3. 유형 `버그 신고`, 내용 입력 → 카운터가 `n / 2000`으로 증가
4. 보내기 → 성공 토스트 + `/settings`로 복귀
5. DB 확인:

```bash
docker compose exec db psql -U postgres -d dngg \
  -c 'SELECT id, "userId", "authorEmail", type, status FROM inquiry ORDER BY id DESC LIMIT 1;'
```

Expected: `status = pending`, `authorEmail`이 로그인 계정 이메일과 일치

- [ ] **Step 5: 커밋**

```bash
cd /Users/onady/project/dngg
git add frontend/src/app/inquiry/page.tsx frontend/src/app/settings/page.tsx
git commit -m "feat: 문의·피드백 폼 페이지와 설정 진입점 추가

헤더 네비는 이미 6개로 포화라 /settings 계정 카드에 진입 버튼을 둔다.
전송 성공 안내는 setPendingToast 대신 showToast를 쓴다 — pendingToast는
ToastProvider 마운트 시점에만 소비되어 클라이언트 내비게이션에서는
표시되지 않기 때문이다."
```

---

### Task 6: 관리자 문의 카드

**Files:**
- Modify: `frontend/src/app/admin/styles.ts` (인라인 답변 영역 스타일 추가)
- Modify: `frontend/src/app/admin/page.tsx` (문의 `S.Card` 추가)

**Interfaces:**
- Consumes: Task 4의 `GET /admin/inquiries` — 응답 `{ id, type, content, authorEmail, status, answer, answeredAt, createdAt }[]`, `POST /admin/inquiries/:id/answer` — 요청 `{ answer: string }`
- Produces: 없음 (마지막 구현 태스크)

- [ ] **Step 1: 스타일 추가**

`frontend/src/app/admin/styles.ts` 맨 아래에 추가한다:

```ts
// 문의 카드 — 답변 인라인 영역
// Table의 td에 white-space: nowrap이 걸려 있어 긴 텍스트용으로 따로 푼다.
export const WrapCell = styled.td`
  white-space: normal;
`;

export const Ellipsis = styled.span`
  display: inline-block;
  max-width: 18rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
`;

export const AnswerBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 0.4rem;
  background: #f9fafb;
`;

export const AnswerArea = styled.textarea`
  width: 100%;
  min-height: 5.5rem;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.85rem;
  font-family: inherit;
  line-height: 1.5;
  resize: vertical;
`;

export const PrimaryButton = styled.button`
  align-self: flex-start;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.4rem 0.9rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  &:hover {
    background: #1d4ed8;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
```

- [ ] **Step 2: 페이지에 타입·상수·상태 추가**

`frontend/src/app/admin/page.tsx` 상단 import에 `useState`를 추가한다:

```tsx
import { useEffect, useState } from "react";
```

`interface SubscriptionOverview { ... }` 블록 **아래**에 추가한다:

```tsx
interface InquiryRow {
  id: number;
  type: string;
  content: string;
  authorEmail: string;
  status: "pending" | "answered";
  answer: string | null;
  answeredAt: string | null;
  createdAt: string;
}

const INQUIRY_TYPE_LABELS: Record<string, string> = {
  bug: "버그",
  feature: "기능 제안",
  billing: "결제·구독",
  etc: "기타",
};
```

- [ ] **Step 3: 쿼리·뮤테이션·핸들러 추가**

`const { data: overview } = useQuery<SubscriptionOverview>({ ... });` 블록 **아래**에 추가한다:

```tsx
  const { data: inquiries } = useQuery<InquiryRow[]>({
    queryKey: ["admin", "inquiries"],
    queryFn: async () => (await api.get("/admin/inquiries")).data,
    enabled: mounted && isAdmin,
  });

  // 어느 행이 펼쳐져 있는지 + 그 행의 답변 초안
  const [openInquiryId, setOpenInquiryId] = useState<number | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");

  const answerMutation = useMutation({
    mutationFn: async (payload: { id: number; answer: string }) =>
      (
        await api.post(`/admin/inquiries/${payload.id}/answer`, {
          answer: payload.answer,
        })
      ).data,
    onSuccess: () => {
      showToast("답변을 보냈습니다.", "success");
      setOpenInquiryId(null);
      setAnswerDraft("");
      queryClient.invalidateQueries({ queryKey: ["admin", "inquiries"] });
    },
    onError: () => {
      // 백엔드가 롤백했으므로 이 문의는 여전히 pending이다. 성공한 척하지 않는다.
      showToast("답변 메일 발송에 실패했습니다. 다시 시도해주세요.", "error");
      queryClient.invalidateQueries({ queryKey: ["admin", "inquiries"] });
    },
  });

  const handleToggleAnswer = (inquiry: InquiryRow) => {
    if (openInquiryId === inquiry.id) {
      setOpenInquiryId(null);
      setAnswerDraft("");
      return;
    }
    setOpenInquiryId(inquiry.id);
    setAnswerDraft(inquiry.answer ?? "");
  };
```

- [ ] **Step 4: 문의 카드 렌더 추가**

`구독·결제 현황` `</S.Card>` **다음**, `</S.Container>` **앞**에 추가한다:

```tsx
      <S.Card>
        <S.CardTitle>문의·피드백</S.CardTitle>
        <S.StatusLine>
          {(() => {
            const rows = inquiries ?? [];
            const pending = rows.filter((row) => row.status === "pending");
            return rows.length === 0
              ? "접수된 문의 없음"
              : `전체 ${rows.length}건 · 미답변 ${pending.length}건`;
          })()}
        </S.StatusLine>
        <S.TableWrap>
          <S.Table>
            <thead>
              <tr>
                <th>접수일</th>
                <th>유형</th>
                <th>작성자</th>
                <th>내용</th>
                <th>상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(inquiries ?? []).map((inquiry) => (
                <React.Fragment key={inquiry.id}>
                  <tr>
                    <td>
                      {new Date(inquiry.createdAt).toLocaleDateString("ko-KR")}
                    </td>
                    <td>
                      {INQUIRY_TYPE_LABELS[inquiry.type] ?? inquiry.type}
                    </td>
                    <td>{inquiry.authorEmail}</td>
                    <td>
                      <S.Ellipsis title={inquiry.content}>
                        {inquiry.content}
                      </S.Ellipsis>
                    </td>
                    <td>
                      {inquiry.status === "answered" ? (
                        <S.Badge $tone="ok">답변 완료</S.Badge>
                      ) : (
                        <S.Badge $tone="warn">미답변</S.Badge>
                      )}
                    </td>
                    <td>
                      <S.SmallButton
                        onClick={() => handleToggleAnswer(inquiry)}
                      >
                        {openInquiryId === inquiry.id
                          ? "닫기"
                          : inquiry.status === "answered"
                            ? "재답변"
                            : "답변"}
                      </S.SmallButton>
                    </td>
                  </tr>
                  {openInquiryId === inquiry.id && (
                    <tr>
                      <S.WrapCell colSpan={6}>
                        <S.AnswerBox>
                          <div>{inquiry.content}</div>
                          <S.AnswerArea
                            value={answerDraft}
                            maxLength={5000}
                            placeholder="작성자에게 보낼 답변을 입력하세요. 전송하면 메일로 발송됩니다."
                            onChange={(e) => setAnswerDraft(e.target.value)}
                          />
                          <S.PrimaryButton
                            disabled={
                              answerMutation.isPending || !answerDraft.trim()
                            }
                            onClick={() =>
                              answerMutation.mutate({
                                id: inquiry.id,
                                answer: answerDraft.trim(),
                              })
                            }
                          >
                            {answerMutation.isPending
                              ? "발송 중..."
                              : "답변 메일 보내기"}
                          </S.PrimaryButton>
                        </S.AnswerBox>
                      </S.WrapCell>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </S.Table>
        </S.TableWrap>
      </S.Card>
```

`React.Fragment`를 쓰므로 파일 상단 import에 `React`를 추가한다:

```tsx
import React, { useEffect, useState } from "react";
```

- [ ] **Step 5: 빌드 확인**

Run: `cd frontend && pnpm build`
Expected: exit 0. (`pnpm lint`은 실행하지 말 것 — 대화형 프롬프트로 멈춘다)

- [ ] **Step 6: 수동 스모크 — 성공 경로**

로컬 백엔드에 `MAIL_FROM`이 설정되어 있지 않다면 dev 폴백(로그 출력)으로 동작한다. 관리자 계정으로 로그인 후 `/admin`:

1. `문의·피드백` 카드에 Task 5에서 남긴 문의가 `미답변` 뱃지로 보인다
2. `답변` 클릭 → 아래에 원문 + textarea가 펼쳐진다
3. 답변 입력 → `답변 메일 보내기` → "답변을 보냈습니다." 토스트, 행이 `답변 완료`로 바뀐다
4. 백엔드 로그에 `[dev] <이메일> 메일 발송 생략 — [dn.gg] 문의하신 내용에 답변드립니다`가 찍힌다
5. DB 확인:

```bash
docker compose exec db psql -U postgres -d dngg \
  -c 'SELECT id, status, "answeredAt" FROM inquiry ORDER BY id DESC LIMIT 1;'
```

Expected: `status = answered`, `answeredAt`이 채워짐

- [ ] **Step 7: 수동 스모크 — 롤백 경로 (핵심)**

발송 실패 시 `pending`으로 남는지 직접 확인한다. `backend/.env.dev`에 실패를 유발하는 값을 임시로 넣는다:

```bash
# backend/.env.dev 에 임시 추가 — 검증 안 된 발신 주소라 SES가 거부한다
MAIL_FROM=not-verified@example.invalid
AWS_REGION=ap-northeast-2
```

백엔드를 재시작한 뒤 `/admin`에서 다른 문의에 답변을 시도한다.

Expected:
- "답변 메일 발송에 실패했습니다. 다시 시도해주세요." 토스트
- 목록을 새로고침해도 해당 문의는 **`미답변` 상태 그대로**
- DB에서 `answer IS NULL`, `status = 'pending'`

```bash
# 방금 답변을 시도한 문의 — 가장 최근 pending 행
docker compose exec db psql -U postgres -d dngg \
  -c "SELECT id, status, answer FROM inquiry WHERE status = 'pending' ORDER BY id DESC LIMIT 1;"
```

확인 후 **`backend/.env.dev`에 추가한 두 줄을 반드시 원복한다.**

- [ ] **Step 8: 커밋**

```bash
cd /Users/onady/project/dngg
git add frontend/src/app/admin/page.tsx frontend/src/app/admin/styles.ts
git commit -m "feat: 관리자 페이지에 문의 조회·답변 카드 추가

행의 답변 버튼을 누르면 그 아래가 인라인으로 펼쳐진다(모달 미도입).
발송 실패 시 백엔드가 롤백하므로 화면도 성공한 척하지 않고
실패 토스트를 띄운 뒤 목록을 다시 불러온다."
```

---

### Task 7: 문서 갱신 및 배포

**Files:**
- Modify: `docs/featurelist.md:6`
- Modify: `handoff.md`
- Modify: `PROJECT_CONTEXT.md` (운영 이력 절 추가)

**Interfaces:**
- Consumes: Task 1~6 전부
- Produces: 운영 배포된 기능

- [ ] **Step 1: featurelist 완료 처리**

`docs/featurelist.md:6`의

```
[ ] 문의, 피드백 받을 경로 추가
```

를 다음으로 바꾼다:

```
[x] 문의, 피드백 받을 경로 추가
```

- [ ] **Step 2: handoff.md 갱신**

`handoff.md`의 `## 남은 TODO` 절에서 다음 줄을 삭제한다:

```
- [ ] 문의, 피드백 받을 경로 추가 ← **지금 이 작업. 설계 완료, 구현 대기**
```

그리고 `## 지금 어디까지 왔나` 절의 `### 완료 — 문의·피드백 경로 설계 (구현 전)` 제목과 본문을 다음으로 교체한다:

```markdown
### 완료 — 문의·피드백 경로 (배포됨)

앱 내 `/inquiry` 폼 → DB 저장 → `/admin` 문의 카드에서 답변 → SES 회신 메일.

- 설계: `docs/superpowers/specs/2026-07-28-inquiry-feedback-design.md`
- 계획: `docs/superpowers/plans/2026-07-28-inquiry-feedback.md`
- 답변 저장과 메일 발송이 한 트랜잭션이라, 발송 실패 시 롤백되어 `pending`으로 남는다.
- `Inquiry.user`는 FK 없이(`createForeignKeyConstraints: false`) 두고 `authorEmail` 스냅샷으로 회신한다.
```

- [ ] **Step 3: 전체 테스트·빌드 최종 확인**

Run:

```bash
cd /Users/onady/project/dngg/backend && pnpm test && pnpm build
cd /Users/onady/project/dngg/frontend && pnpm build
```

Expected: 네 명령 모두 exit 0. **하나라도 실패하면 배포하지 않는다.**

- [ ] **Step 4: 문서 커밋**

```bash
cd /Users/onady/project/dngg
git add docs/featurelist.md handoff.md docs/superpowers/plans/2026-07-28-inquiry-feedback.md
git commit -m "docs: 문의·피드백 경로 구현 완료 처리 및 인수인계 문서 갱신"
```

- [ ] **Step 5: 배포**

`main` 푸시는 곧 운영 배포다. 이번 변경은 `backend/**`와 `frontend/**`를 모두 건드리므로 두 잡이 함께 돌아야 한다.

```bash
cd /Users/onady/project/dngg
git push origin main
```

그 다음 CI를 확인한다:

```bash
gh run watch
```

Expected: `backend`·`frontend`·`deploy` 세 잡이 모두 success. **두 빌드 잡이 같은 커밋 sha로 배포되는지 확인할 것** — 한쪽만 성공하면 신규 프론트 + 구형 백엔드 조합이 되어 문의 전송이 404로 실패한다(2026-07-18 장애 사례).

한쪽 잡이 실패했다면 원인을 고쳐 다시 푸시하거나, Actions 탭의 workflow_dispatch로 백엔드·프론트를 동시 재배포한다.

- [ ] **Step 6: 운영 스모크**

CI 헬스체크는 기존 라우트(`/group/all`, 프론트 루트)만 확인하므로 신규 경로는 직접 확인한다.

1. `https://dngg.one/settings` 로그인 → `문의·피드백` 버튼 노출 확인
2. `/inquiry`에서 실제 문의를 하나 접수 → 성공 토스트
3. 관리자 계정으로 `https://dngg.one/admin` → `문의·피드백` 카드에 방금 문의가 `미답변`으로 보임
4. 답변 입력 후 전송 → `답변 완료`로 전환
5. **작성자 메일함에서 회신 메일 수신 확인** — 제목 `[dn.gg] 문의하신 내용에 답변드립니다`, 본문에 원문과 답변이 모두 포함

메일이 오지 않는데 화면이 `답변 완료`로 바뀌었다면 트랜잭션 불변식이 깨진 것이다 — 즉시 조사할 것.

- [ ] **Step 7: PROJECT_CONTEXT.md에 운영 이력 추가**

배포와 스모크가 끝난 뒤, `PROJECT_CONTEXT.md`의 운영 이력 절(SES 항목 `5.4` 다음 번호)에 추가한다:

```markdown
### 5.5 문의·피드백 경로 (2026-07-28)

앱 내 `/inquiry` 폼으로 문의를 접수해 `inquiry` 테이블에 저장하고,
`/admin` 문의 카드에서 답변하면 SES로 회신 메일이 나간다.

- **답변 저장과 메일 발송은 한 트랜잭션이다.** 발송 실패 시 UPDATE가 롤백되어
  `status`는 `pending`으로 남는다. 불변식: `status === 'answered'`이면 메일이 실제로 나갔다.
  재답변(덮어쓰기 + 재발송)이 곧 재시도 경로다.
- **`Inquiry.user`에는 FK가 없다** (`createForeignKeyConstraints: false` + `nullable: true`).
  `UserService.deleteUser`가 하드 삭제라 FK를 걸면 문의를 남긴 사용자의 탈퇴가 실패한다.
  회신은 `user.email`이 아니라 작성 시점 스냅샷 `authorEmail`로 보내므로 탈퇴 계정에도 답장할 수 있다.
- `MailService.send(to, subject, body)`가 SES 클라이언트 생성과 `MAIL_FROM` 폴백을 담당하고
  `sendVerificationCode`·`sendInquiryAnswer`가 공유한다. `MAIL_FROM` 미설정(dev)은 발송 실패가 아니다.
- 범위 밖: 대화형 스레드, 앱 내 문의 내역 화면, 파일 첨부, 비로그인 문의.
```

- [ ] **Step 8: 커밋 및 푸시**

```bash
cd /Users/onady/project/dngg
git add PROJECT_CONTEXT.md
git commit -m "docs: 문의·피드백 경로 운영 이력 추가"
git push origin main
```

이 커밋은 `docs/`만 건드리므로 CI 경로 필터상 빌드 잡이 돌지 않는다.

---

## 검증 요약

| 항목 | 명령 / 방법 |
|---|---|
| DTO 검증 | `cd backend && pnpm test -- src/modules/inquiry/inquiry.request.dto.spec.ts` |
| 메일 템플릿·발송 | `cd backend && pnpm test -- src/modules/mail/mail.service.spec.ts` |
| 트랜잭션 롤백(핵심) | `cd backend && pnpm test -- src/modules/inquiry/inquiry.service.spec.ts` |
| 인증 메일 회귀 | `cd backend && pnpm test -- src/modules/user` |
| 전체 | `cd backend && pnpm test && pnpm build` |
| 프론트 | `cd frontend && pnpm build` + Task 5·6의 수동 스모크 (`pnpm lint` 사용 금지) |
| 롤백 실동작 | Task 6 Step 7 — 잘못된 `MAIL_FROM`으로 발송 실패 유발 후 `pending` 유지 확인 |
| 운영 | Task 7 Step 6 — 실제 회신 메일 수신까지 확인 |
