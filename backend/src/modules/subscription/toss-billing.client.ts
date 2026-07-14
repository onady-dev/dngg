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

  private async post(path: string, body: unknown): Promise<any> {
    const res = await fetch(`${TOSS_BASE}${path}`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
      },
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
    const data = await this.post('/v1/billing/authorizations/issue', {
      authKey,
      customerKey,
    });
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
    const data = await this.post(`/v1/billing/${billingKey}`, {
      customerKey,
      amount,
      orderId,
      orderName,
    });
    return {
      paymentKey: data.paymentKey,
      orderId: data.orderId,
      approvedAt: data.approvedAt,
    };
  }
}
