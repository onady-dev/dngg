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
