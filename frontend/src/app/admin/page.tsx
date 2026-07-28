"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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

interface InquiryPage {
  rows: InquiryRow[];
  total: number;
  page: number;
  limit: number;
}

const INQUIRY_PAGE_SIZE = 20;

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

  const {
    data: inquiryPages,
    fetchNextPage: fetchMoreInquiries,
    hasNextPage: hasMoreInquiries,
    isFetchingNextPage: isFetchingMoreInquiries,
  } = useInfiniteQuery<InquiryPage>({
    queryKey: ["admin", "inquiries", "list"],
    queryFn: async ({ pageParam }) =>
      (
        await api.get("/admin/inquiries", {
          params: { page: pageParam, limit: INQUIRY_PAGE_SIZE },
        })
      ).data,
    initialPageParam: 1,
    // 지금까지 불러온 행 수가 전체보다 적을 때만 다음 페이지가 있다.
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.rows.length, 0);
      return loaded < lastPage.total ? allPages.length + 1 : undefined;
    },
    enabled: mounted && isAdmin,
  });

  const inquiries = inquiryPages?.pages.flatMap((page) => page.rows) ?? [];
  const inquiryTotal = inquiryPages?.pages[0]?.total ?? 0;

  // 미답변 건수는 불러온 페이지가 아니라 전체 기준이어야 한다.
  // status 필터에 total이 실려 오므로 1건만 요청해 total만 읽는다.
  const { data: pendingInquiryPage } = useQuery<InquiryPage>({
    queryKey: ["admin", "inquiries", "pending-count"],
    queryFn: async () =>
      (
        await api.get("/admin/inquiries", {
          params: { status: "pending", limit: 1 },
        })
      ).data,
    enabled: mounted && isAdmin,
  });
  const pendingInquiryTotal = pendingInquiryPage?.total ?? 0;

  // 어느 행이 펼쳐져 있는지 + 행별 답변 초안(행마다 독립적으로 유지)
  const [openInquiryId, setOpenInquiryId] = useState<number | null>(null);
  const [answerDrafts, setAnswerDrafts] = useState<Record<number, string>>(
    {},
  );
  // 공유 useMutation 하나로 여러 행을 동시에 보낼 수 있어 mutation.variables는
  // "가장 최근에 발사된 요청"만 가리킨다 — 행별 in-flight 여부는 별도로 추적한다.
  const [inFlightInquiryIds, setInFlightInquiryIds] = useState<Set<number>>(
    new Set(),
  );

  const answerMutation = useMutation({
    mutationFn: async (payload: { id: number; answer: string }) =>
      (
        await api.post(`/admin/inquiries/${payload.id}/answer`, {
          answer: payload.answer,
        })
      ).data,
    onMutate: (variables) => {
      setInFlightInquiryIds((prev) => new Set(prev).add(variables.id));
    },
    onSuccess: (_data, variables) => {
      showToast("답변을 보냈습니다.", "success");
      // 그 사이 다른 행을 열었을 수 있으니, 방금 보낸 행이 여전히 열려있을 때만 닫는다.
      setOpenInquiryId((current) =>
        current === variables.id ? null : current,
      );
      setAnswerDrafts((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["admin", "inquiries"] });
    },
    onError: () => {
      // 백엔드가 롤백했으므로 이 문의는 여전히 pending이다. 성공한 척하지 않는다.
      showToast("답변 메일 발송에 실패했습니다. 다시 시도해주세요.", "error");
      queryClient.invalidateQueries({ queryKey: ["admin", "inquiries"] });
    },
    onSettled: (_data, _error, variables) => {
      // 성공/실패 모두 해당 행의 in-flight 상태를 해제한다 — 다른 행의 동시
      // 진행 상태를 덮어쓰지 않도록 함수형 업데이트로 처리.
      setInFlightInquiryIds((prev) => {
        const next = new Set(prev);
        next.delete(variables.id);
        return next;
      });
    },
  });

  const handleToggleAnswer = (inquiry: InquiryRow) => {
    if (openInquiryId === inquiry.id) {
      setOpenInquiryId(null);
      setAnswerDrafts((prev) => {
        const next = { ...prev };
        delete next[inquiry.id];
        return next;
      });
      return;
    }
    setOpenInquiryId(inquiry.id);
    setAnswerDrafts((prev) =>
      inquiry.id in prev
        ? prev
        : { ...prev, [inquiry.id]: inquiry.answer ?? "" },
    );
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
          {inquiryTotal === 0
            ? "접수된 문의 없음"
            : `전체 ${inquiryTotal}건 · 미답변 ${pendingInquiryTotal}건` +
              (inquiries.length < inquiryTotal
                ? ` · ${inquiries.length}건 표시 중`
                : "")}
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
              {inquiries.map((inquiry) => (
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
                  {openInquiryId === inquiry.id &&
                    (() => {
                      const draft = answerDrafts[inquiry.id] ?? "";
                      const isSendingThisRow = inFlightInquiryIds.has(
                        inquiry.id,
                      );
                      return (
                        <tr>
                          <S.WrapCell colSpan={6}>
                            <S.AnswerBox>
                              <div>{inquiry.content}</div>
                              <S.AnswerArea
                                value={draft}
                                maxLength={5000}
                                placeholder="작성자에게 보낼 답변을 입력하세요. 전송하면 메일로 발송됩니다."
                                onChange={(e) =>
                                  setAnswerDrafts((prev) => ({
                                    ...prev,
                                    [inquiry.id]: e.target.value,
                                  }))
                                }
                              />
                              <S.PrimaryButton
                                disabled={isSendingThisRow || !draft.trim()}
                                onClick={() =>
                                  answerMutation.mutate({
                                    id: inquiry.id,
                                    answer: draft.trim(),
                                  })
                                }
                              >
                                {isSendingThisRow
                                  ? "발송 중..."
                                  : "답변 메일 보내기"}
                              </S.PrimaryButton>
                            </S.AnswerBox>
                          </S.WrapCell>
                        </tr>
                      );
                    })()}
                </React.Fragment>
              ))}
            </tbody>
          </S.Table>
        </S.TableWrap>
        {hasMoreInquiries && (
          <S.MoreButton
            disabled={isFetchingMoreInquiries}
            onClick={() => void fetchMoreInquiries()}
          >
            {isFetchingMoreInquiries ? "불러오는 중..." : "더 보기"}
          </S.MoreButton>
        )}
      </S.Card>
    </S.Container>
  );
};

export default AdminPage;
