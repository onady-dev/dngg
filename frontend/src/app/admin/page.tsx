"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/axios";
import { useAuthStore } from "@/app/stores/useAuthStore";
import { useGroupStore } from "@/app/stores/groupStore";
import { useToast } from "@/app/components/ui/Toast";
import { useMounted } from "@/app/lib/useMounted";
import * as S from "./styles";

interface Monetization {
  started: boolean;
  startedAt: string | null;
}

interface AdminGroupRow {
  id: number;
  name: string;
  gameCount: number;
  freeGamesUsed: number;
  subscriptionStatus: string;
}

interface SubscriptionOverview {
  statusCounts: { status: string; count: number }[];
  recentPayments: {
    id: number;
    groupName: string;
    amount: number;
    status: string;
    orderId: string;
    paidAt: string | null;
    failReason: string | null;
  }[];
}

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

const AdminPage = () => {
  const mounted = useMounted();
  const router = useRouter();
  const { user } = useAuthStore((state) => state);
  const setUser = useAuthStore((state) => state.setUser);
  const setSelectedGroup = useGroupStore((state) => state.setSelectedGroup);
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (mounted && !isAdmin) {
      router.replace("/");
    }
  }, [mounted, isAdmin, router]);

  const { data: monetization } = useQuery<Monetization>({
    queryKey: ["admin", "monetization"],
    queryFn: async () => (await api.get("/admin/monetization")).data,
    enabled: mounted && isAdmin,
  });

  const { data: groups } = useQuery<AdminGroupRow[]>({
    queryKey: ["admin", "groups"],
    queryFn: async () => (await api.get("/admin/groups")).data,
    enabled: mounted && isAdmin,
  });

  const { data: overview } = useQuery<SubscriptionOverview>({
    queryKey: ["admin", "subscriptions"],
    queryFn: async () => (await api.get("/admin/subscriptions")).data,
    enabled: mounted && isAdmin,
  });

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

  const startMutation = useMutation({
    mutationFn: async () => (await api.post("/admin/monetization/start")).data,
    onSuccess: () => {
      showToast("유료화 서비스가 시작되었습니다.", "success");
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
    },
    onError: (error: unknown) => {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      if (status === 409) {
        showToast("이미 유료화가 시작되었습니다.", "info");
        queryClient.invalidateQueries({ queryKey: ["admin"] });
      } else {
        showToast("유료화 시작에 실패했습니다.", "error");
      }
    },
  });

  const handleStart = () => {
    const confirmed = window.confirm(
      "유료화 서비스를 시작합니다.\n\n- 모든 그룹의 기존 게임 수가 무료 한도(10회)에 즉시 반영됩니다.\n- 이 작업은 되돌릴 수 없습니다.\n\n계속할까요?",
    );
    if (confirmed) {
      startMutation.mutate();
    }
  };

  // Header의 관리자 그룹 전환과 동일한 흐름 — 스코프 토큰 교체 후 해당 그룹으로 이동
  const handleSwitch = async (groupId: number) => {
    if (!user) return;
    try {
      const response = await api.post(`/admin/switch-group/${groupId}`);
      localStorage.setItem("token", response.data.accessToken);
      setUser({
        ...user,
        groupId: response.data.groupId,
        accessToken: response.data.accessToken,
      });
      queryClient.clear();
      setSelectedGroup(groupId);
      showToast("그룹이 전환되었습니다.", "success");
      router.push("/games");
    } catch {
      showToast("그룹 전환에 실패했습니다.", "error");
    }
  };

  if (!mounted || !isAdmin) return null;

  return (
    <S.Container>
      <S.Title>관리자</S.Title>

      <S.Card>
        <S.CardTitle>유료화 서비스</S.CardTitle>
        {monetization?.started ? (
          <S.StatusLine>
            시작됨 ·{" "}
            {monetization.startedAt
              ? new Date(monetization.startedAt).toLocaleString("ko-KR")
              : "-"}
          </S.StatusLine>
        ) : (
          <>
            <S.StatusLine>
              아직 시작 전입니다. 시작하면 각 그룹의 기존 게임 수가 무료
              한도에 포함되고, 초과 그룹은 구독해야 새 경기를 만들 수
              있습니다.
            </S.StatusLine>
            <S.DangerButton
              onClick={handleStart}
              disabled={startMutation.isPending}
            >
              {startMutation.isPending ? "시작 중..." : "유료화 서비스 시작"}
            </S.DangerButton>
          </>
        )}
      </S.Card>

      <S.Card>
        <S.CardTitle>그룹 현황</S.CardTitle>
        <S.TableWrap>
          <S.Table>
            <thead>
              <tr>
                <th>그룹</th>
                <th>게임 수</th>
                <th>무료 사용</th>
                <th>구독</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(groups ?? []).map((group) => (
                <tr key={group.id}>
                  <td>{group.name}</td>
                  <td>{group.gameCount}</td>
                  <td>{group.freeGamesUsed}</td>
                  <td>
                    {group.subscriptionStatus === "none" ? (
                      <S.Badge $tone="muted">없음</S.Badge>
                    ) : group.subscriptionStatus === "active" ? (
                      <S.Badge $tone="ok">active</S.Badge>
                    ) : (
                      <S.Badge $tone="warn">
                        {group.subscriptionStatus}
                      </S.Badge>
                    )}
                  </td>
                  <td>
                    <S.SmallButton onClick={() => handleSwitch(group.id)}>
                      이 그룹으로 전환
                    </S.SmallButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </S.Table>
        </S.TableWrap>
      </S.Card>

      <S.Card>
        <S.CardTitle>구독·결제 현황</S.CardTitle>
        <S.StatusLine>
          {(overview?.statusCounts ?? [])
            .map((row) => `${row.status} ${row.count}건`)
            .join(" · ") || "구독 없음"}
        </S.StatusLine>
        <S.TableWrap>
          <S.Table>
            <thead>
              <tr>
                <th>그룹</th>
                <th>금액</th>
                <th>상태</th>
                <th>일시</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.recentPayments ?? []).map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.groupName}</td>
                  <td>{payment.amount.toLocaleString("ko-KR")}원</td>
                  <td>
                    {payment.status === "success" ? (
                      <S.Badge $tone="ok">성공</S.Badge>
                    ) : (
                      <S.Badge $tone="warn">실패</S.Badge>
                    )}
                  </td>
                  <td>
                    {payment.paidAt
                      ? new Date(payment.paidAt).toLocaleString("ko-KR")
                      : "-"}
                  </td>
                  <td>{payment.failReason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </S.Table>
        </S.TableWrap>
      </S.Card>

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
    </S.Container>
  );
};

export default AdminPage;
