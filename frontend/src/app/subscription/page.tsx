"use client";

import { Suspense, useEffect, useRef } from "react";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { showGlobalToast } from "@/lib/toastBus";
import * as S from "./styles";

type BillingCycle = "monthly" | "yearly";

interface StatusResponse {
  subscribed: boolean;
  status: "none" | "active" | "past_due" | "canceled" | "expired";
  billingCycle: BillingCycle | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  freeGamesUsed: number;
  freeGameLimit: number;
  remainingFreeGames: number;
  monetizationStarted: boolean;
  customerKey: string;
  prices: { monthly: number; yearly: number };
}

interface PaymentsResponse {
  items: Array<{
    id: number;
    amount: number;
    status: "success" | "failed";
    paidAt: string | null;
    createdAt: string;
  }>;
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function SubscriptionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  const { data: status, isLoading } = useQuery<StatusResponse>({
    queryKey: ["subscription", "status"],
    queryFn: async () => (await api.get("/subscription/status")).data,
  });

  const { data: payments } = useQuery<PaymentsResponse>({
    queryKey: ["subscription", "payments"],
    queryFn: async () => (await api.get("/subscription/payments")).data,
    enabled: !!status?.subscribed,
  });

  const subscribeMutation = useMutation({
    mutationFn: async (params: { authKey: string; billingCycle: BillingCycle }) =>
      (await api.post("/subscription/billing-key", params)).data,
    onSuccess: () => {
      showGlobalToast("구독이 시작되었습니다.", "success");
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      router.replace("/subscription");
    },
    onError: (e: any) => {
      showGlobalToast(
        e?.response?.data?.message ?? "결제에 실패했습니다.",
        "error",
      );
      router.replace("/subscription");
    },
  });

  // 토스 리다이렉트 복귀: authKey가 있으면 빌링키 발급 + 첫 결제.
  // authKey당 정확히 1회만 제출한다 — StrictMode 이중 실행/리렌더에서 중복 POST가
  // 나가면 두 번째는 이미 소비된 authKey로 실패하므로, ref로 제출 이력을 가드한다.
  const submittedAuthKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const authKey = searchParams.get("authKey");
    const returnedCycle =
      (searchParams.get("cycle") as BillingCycle) ?? "monthly";
    if (authKey && submittedAuthKeyRef.current !== authKey) {
      submittedAuthKeyRef.current = authKey;
      subscribeMutation.mutate({ authKey, billingCycle: returnedCycle });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const cancelMutation = useMutation({
    mutationFn: async () => (await api.post("/subscription/cancel")).data,
    onSuccess: () => {
      showGlobalToast("해지가 예약되었습니다.", "info");
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => (await api.post("/subscription/resume")).data,
    onSuccess: () => {
      showGlobalToast("구독이 유지됩니다.", "success");
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
    },
  });

  const startBillingAuth = async () => {
    if (!status) return;
    const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
    if (!clientKey) {
      showGlobalToast("결제 설정이 누락되었습니다.", "error");
      return;
    }
    const tossPayments = await loadTossPayments(clientKey);
    const payment = tossPayments.payment({ customerKey: status.customerKey });
    await payment.requestBillingAuth({
      method: "CARD",
      successUrl: `${window.location.origin}/subscription?cycle=${cycle}`,
      failUrl: `${window.location.origin}/subscription?fail=1`,
    });
  };

  if (isLoading || !status) {
    return (
      <S.Container>
        <S.Card>불러오는 중…</S.Card>
      </S.Container>
    );
  }

  const periodEndText = status.currentPeriodEnd
    ? new Date(status.currentPeriodEnd).toLocaleDateString("ko-KR")
    : null;

  return (
    <S.Container>
      <S.Card>
        <S.Title>구독</S.Title>
        {status.subscribed ? (
          <>
            {status.status === "past_due" && (
              <S.StatusLine>
                결제에 실패했습니다. 카드 상태를 확인해 주세요 (유예 기간 중).
              </S.StatusLine>
            )}
            <S.StatusLine>
              {status.cancelAtPeriodEnd
                ? `해지 예약됨 · ${periodEndText}까지 이용 가능`
                : `구독 중 · 다음 결제일 ${periodEndText}`}
            </S.StatusLine>
            {status.cancelAtPeriodEnd ? (
              <S.SecondaryButton
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending}
              >
                해지 취소
              </S.SecondaryButton>
            ) : (
              <S.SecondaryButton
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
              >
                구독 해지
              </S.SecondaryButton>
            )}
          </>
        ) : (
          <>
            <S.StatusLine>
              {status.monetizationStarted
                ? `무료 잔여 경기 생성 ${status.remainingFreeGames}회 / ${status.freeGameLimit}회`
                : "유료화 시작 전 — 경기 생성 무제한"}
            </S.StatusLine>
            <S.PlanRow>
              <S.PlanButton
                $active={cycle === "monthly"}
                onClick={() => setCycle("monthly")}
              >
                월 {won(status.prices.monthly)}
              </S.PlanButton>
              <S.PlanButton
                $active={cycle === "yearly"}
                onClick={() => setCycle("yearly")}
              >
                연 {won(status.prices.yearly)}
              </S.PlanButton>
            </S.PlanRow>
            <S.PrimaryButton
              onClick={startBillingAuth}
              disabled={subscribeMutation.isPending}
            >
              {subscribeMutation.isPending ? "처리 중…" : "구독하기"}
            </S.PrimaryButton>
          </>
        )}
      </S.Card>

      {status.subscribed && payments && payments.items.length > 0 && (
        <S.Card>
          <S.Title>결제 내역</S.Title>
          {payments.items.map((p) => (
            <S.PaymentItem key={p.id}>
              <span>
                {new Date(p.paidAt ?? p.createdAt).toLocaleDateString("ko-KR")}
              </span>
              <span>
                {won(p.amount)} · {p.status === "success" ? "완료" : "실패"}
              </span>
            </S.PaymentItem>
          ))}
        </S.Card>
      )}
    </S.Container>
  );
}

export default function SubscriptionPage() {
  return (
    <Suspense
      fallback={
        <S.Container>
          <S.Card>불러오는 중…</S.Card>
        </S.Container>
      }
    >
      <SubscriptionContent />
    </Suspense>
  );
}
