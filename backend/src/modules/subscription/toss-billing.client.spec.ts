import { TossBillingClient } from './toss-billing.client';

describe('TossBillingClient', () => {
  const OLD_ENV = process.env.TOSS_SECRET_KEY;

  beforeEach(() => {
    process.env.TOSS_SECRET_KEY = 'test_sk_dummy';
  });

  afterAll(() => {
    process.env.TOSS_SECRET_KEY = OLD_ENV;
    jest.restoreAllMocks();
  });

  test('issueBillingKey는 성공 시 billingKey를 반환한다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ billingKey: 'bk_123' }),
    }) as any;

    const client = new TossBillingClient();
    const result = await client.issueBillingKey('auth_1', 'cust_1');

    expect(result.billingKey).toBe('bk_123');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.tosspayments.com/v1/billing/authorizations/issue',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('requestBillingPayment는 실패 응답 시 토스 메시지로 에러를 던진다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: '카드 한도 초과' }),
    }) as any;

    const client = new TossBillingClient();

    await expect(
      client.requestBillingPayment({
        billingKey: 'bk_1',
        customerKey: 'cust_1',
        amount: 9900,
        orderId: 'ord_1',
        orderName: '월 구독',
      }),
    ).rejects.toThrow('카드 한도 초과');
  });
});
