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
    idempotencyKey?: string;
  }): Promise<TossPaymentResult> {
    const { billingKey, customerKey, amount, orderId, orderName } = params;
    // Idempotency-Key 기본값은 orderId다. 두 재시도 경로가 이 키를 공유하므로
    // 호출부가 상황에 맞게 구분해서 넘겨야 한다:
    // (A) 결제 성공 후 DB persist 실패 → 다음 크론이 같은 orderId로 재시도.
    //     이때는 결정적인 orderId를 그대로 써야 토스가 새 요청으로 처리하지 않고
    //     원래 성공 응답을 그대로 반환한다.
    // (B) 진짜 카드 거절 → 다음 크론이 같은 orderId로 재시도. 이때 결정적인
    //     orderId를 그대로 쓰면 토스가 예전 거절 응답을 캐시해 반환할 수 있어,
    //     카드 문제를 해결한 사용자도 영원히 거절을 재현받는다. 호출부가
    //     idempotencyKey를 날짜별로 신선하게 넘겨 이 문제를 피한다.
    // 최초 결제(subscribe)는 시도별 UUID orderId라 기본값으로도 안전하다.
    const idempotencyKey = params.idempotencyKey ?? orderId;
    const data = await this.post(
      `/v1/billing/${billingKey}`,
      { customerKey, amount, orderId, orderName },
      idempotencyKey,
    );
    return {
      paymentKey: data.paymentKey,
      orderId: data.orderId,
      approvedAt: data.approvedAt,
    };
  }
}
