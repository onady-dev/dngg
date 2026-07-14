import { Injectable } from '@nestjs/common';

const TOSS_BASE = 'https://api.tosspayments.com';

export interface IssueBillingKeyResult {
  billingKey: string;
}

export interface TossPaymentResult {
  paymentKey: string;
  orderId: string;
  approvedAt: string;
}

@Injectable()
export class TossBillingClient {
  private authHeader(): string {
    const secret = process.env.TOSS_SECRET_KEY ?? '';
    // 토스 규격: "시크릿키:" 를 base64로 인코딩한 Basic 인증
    const encoded = Buffer.from(`${secret}:`).toString('base64');
    return `Basic ${encoded}`;
  }

  private async post(
    path: string,
    body: unknown,
    idempotencyKey?: string,
  ): Promise<any> {
    const headers: Record<string, string> = {
      Authorization: this.authHeader(),
      'Content-Type': 'application/json',
    };
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    const res = await fetch(`${TOSS_BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.message ?? '토스 API 요청이 실패했습니다.');
    }
    return data;
  }

  async issueBillingKey(
    authKey: string,
    customerKey: string,
  ): Promise<IssueBillingKeyResult> {
    const data = await this.post(
      '/v1/billing/authorizations/issue',
      { authKey, customerKey },
      customerKey,
    );
    return { billingKey: data.billingKey };
  }

  async requestBillingPayment(params: {
    billingKey: string;
    customerKey: string;
    amount: number;
    orderId: string;
    orderName: string;
  }): Promise<TossPaymentResult> {
    const { billingKey, customerKey, amount, orderId, orderName } = params;
    // orderId를 Idempotency-Key로 사용한다: 갱신은 (구독, 주기)당 결정적인
    // orderId를 재사용하므로 재시도 시 토스가 새 요청으로 거절하지 않고
    // 원래 성공 응답을 그대로 반환한다. 최초 결제도 시도별 UUID orderId라
    // 동일하게 안전하다.
    const data = await this.post(
      `/v1/billing/${billingKey}`,
      { customerKey, amount, orderId, orderName },
      orderId,
    );
    return {
      paymentKey: data.paymentKey,
      orderId: data.orderId,
      approvedAt: data.approvedAt,
    };
  }
}
