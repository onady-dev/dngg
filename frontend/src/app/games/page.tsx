"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import styled from "styled-components";
import Link from "next/link";
import type { Game, LogItem } from "@/types/game";
import type { Team } from "@/types/player";
import { useGroupStore } from "../stores/groupStore";
import { api } from "@/lib/axios";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../stores/useAuthStore";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { useMounted } from "../lib/useMounted";
import NoGroupSelected from "../components/NoGroupSelected";
import { fetchTeams } from "@/lib/teamApi";
import { fetchSeasons, Season } from "@/lib/seasonApi";
import { useQuery } from "@tanstack/react-query";
import GameSeasonActionBar from "./components/GameSeasonActionBar";
import { assignGameSeason, fetchFinishedGamesInRange } from "@/lib/gameApi";

const FINISHED_PAGE_SIZE = 10;

const Container = styled.div`
  padding: 1rem;
  margin-top: calc(var(--header-height) + 4px);

  @media (min-width: 768px) {
    padding: 1.5rem;
  }
`;

const Header = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
  position: relative;
  z-index: 10;
  align-items: center;

  @media (min-width: 768px) {
    flex-wrap: nowrap;
    justify-content: space-between;
    gap: 2rem;
  }
`;

const Title = styled.h1`
  font-size: 1.25rem;
  font-weight: bold;
  white-space: nowrap;

  @media (min-width: 768px) {
    font-size: 1.5rem;
  }
`;

const CreateGameButton = styled.button`
  padding: 0.4rem 0.6rem;
  background-color: var(--primary-color);
  color: white;
  border-radius: 0.375rem;
  font-size: 0.813rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.2s;

  @media (min-width: 768px) {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
  }

  &:hover {
    background-color: var(--hover-color);
  }

  &:disabled {
    background-color: #9ca3af;
    cursor: not-allowed;
  }
`;

const LoginBanner = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  background-color: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: #1e40af;

  a {
    background-color: var(--primary-color);
    color: white;
    padding: 0.375rem 0.875rem;
    border-radius: 0.375rem;
    font-weight: 500;
    white-space: nowrap;

    &:hover {
      background-color: var(--hover-color);
    }
  }
`;

const Content = styled.div`
  display: grid;
  gap: 1rem;

  @media (min-width: 768px) {
    gap: 1.5rem;
  }
`;

const Section = styled.div`
  background: white;
  border-radius: 0.5rem;
  padding: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  @media (min-width: 768px) {
    padding: 1.25rem;
  }
`;

const SectionTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: var(--text-color);

  @media (min-width: 768px) {
    font-size: 1.25rem;
  }
`;

const GameList = styled.div`
  display: grid;
  gap: 0.75rem;

  @media (min-width: 768px) {
    gap: 1rem;
  }
`;

const GameCard = styled.div`
  background: white;
  border-radius: 0.5rem;
  padding: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  @media (min-width: 768px) {
    padding: 1.25rem;
  }
`;

const GameInfo = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  gap: 0.5rem;
`;

const GameName = styled.h3`
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-color);

  @media (min-width: 768px) {
    font-size: 1.125rem;
  }
`;

const GameDate = styled.span`
  font-size: 0.75rem;
  color: #6b7280;
  white-space: nowrap;

  @media (min-width: 768px) {
    font-size: 0.875rem;
  }
`;

const SeasonBadge = styled.span`
  display: inline-block;
  margin-left: 0.5rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 0.6875rem;
  font-weight: 600;
  vertical-align: middle;
`;

const TeamsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 0.75rem;

  @media (min-width: 768px) {
    flex-direction: row;
    align-items: flex-start;
  }
`;

const TeamSection = styled.div`
  flex: 1;

  @media (min-width: 768px) {
    width: 50%;

    &:first-child {
      border-right: 1px solid #e5e7eb;
      padding-right: 1rem;
    }

    &:last-child {
      padding-left: 1rem;
    }
  }
`;

const TeamLabel = styled.span`
  font-size: 0.875rem;
  color: #6b7280;
  font-weight: 500;
  display: block;
  margin-bottom: 0.5rem;
`;

const PlayerList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const PlayerTag = styled.span`
  background-color: #f3f4f6;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  color: #374151;
`;

const GameActions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const ActionButton = styled.button`
  padding: 0.375rem 0.625rem;
  background-color: var(--primary-color);
  color: white;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
  transition: background-color 0.2s;

  @media (min-width: 768px) {
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
  }

  &:hover {
    background-color: var(--hover-color);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 1rem;
`;

const ModalContent = styled.div`
  background: white;
  padding: 2rem;
  border-radius: 0.5rem;
  width: 100%;
  max-width: 400px;
`;

const ModalTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 1rem;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.5rem;
  margin-bottom: 1rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  font-size: 1rem;

  &:focus {
    outline: none;
    border-color: var(--primary-color);
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 0.5rem;
  margin-bottom: 1rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  font-size: 1rem;
  background-color: white;

  &:focus {
    outline: none;
    border-color: var(--primary-color);
  }
`;

const ModalButtons = styled.div`
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
`;

const ModalButton = styled.button`
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:first-child {
    background-color: var(--primary-color);
    color: white;

    &:hover {
      background-color: var(--hover-color);
    }
  }

  &:last-child {
    background-color: #f3f4f6;
    color: var(--text-color);

    &:hover {
      background-color: #e5e7eb;
    }
  }
`;

const NoTeamsGuide = styled.div`
  background-color: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 0.375rem;
  padding: 0.875rem 1rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: #92400e;
  line-height: 1.5;

  a {
    display: inline-block;
    margin-top: 0.5rem;
    background-color: var(--primary-color);
    color: white;
    padding: 0.375rem 0.875rem;
    border-radius: 0.375rem;
    font-weight: 500;

    &:hover {
      background-color: var(--hover-color);
    }
  }
`;

const EmptyStateCard = styled.div`
  text-align: center;
  padding: 2rem 1rem;
  color: #6b7280;
  font-size: 0.9375rem;
  line-height: 1.6;

  a {
    display: inline-block;
    margin-top: 0.75rem;
    background-color: var(--primary-color);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    font-weight: 500;
    font-size: 0.875rem;

    &:hover {
      background-color: var(--hover-color);
    }
  }
`;

const GameStatusBadge = styled.span`
  background-color: #dcfce7;
  color: #166534;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
`;

const LoadMoreSpinner = styled.div`
  display: flex;
  justify-content: center;
  padding: 1.5rem;
`;

const Spinner = styled.div`
  width: 24px;
  height: 24px;
  border: 3px solid #e5e7eb;
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  padding: 6rem 0;
`;

const SelectToolbar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  background: #f9fafb;
`;

const RangeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const DateInput = styled.input`
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  font-size: 0.8125rem;
`;

const SmallButton = styled.button`
  padding: 0.375rem 0.625rem;
  border-radius: 0.375rem;
  background: #e5e7eb;
  color: #374151;
  font-size: 0.8125rem;
  white-space: nowrap;
`;

const SelectAllRow = styled.label`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  cursor: pointer;
`;

const MoreHint = styled.p`
  margin: 0;
  font-size: 0.75rem;
  color: #b45309;
`;

const SelectCheckbox = styled.input`
  margin-right: 0.5rem;
  width: 1.125rem;
  height: 1.125rem;
`;

const GamesPage = () => {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const { selectedGroup } = useGroupStore();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const mounted = useMounted();
  const [inProgressGames, setInProgressGames] = useState<Game[]>([]);
  const [finishedGames, setFinishedGames] = useState<Game[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [hasMoreFinished, setHasMoreFinished] = useState(false);
  const [loadingMoreFinished, setLoadingMoreFinished] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState<{ teamA?: Team; teamB?: Team }>({});
  const [loading, setLoading] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedGameIds, setSelectedGameIds] = useState<Set<number>>(new Set());
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangeApplied, setRangeApplied] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const { data: subStatus } = useQuery<{
    subscribed: boolean;
    remainingFreeGames: number;
    monetizationStarted: boolean;
  }>({
    queryKey: ["subscription", "status"],
    queryFn: async () => (await api.get("/subscription/status")).data,
    enabled: mounted && !!user,
  });

  const finishedPageRef = useRef(0);
  const finishedLoadingRef = useRef(false);
  const finishedSentinelRef = useRef<HTMLDivElement>(null);

  const canManage = !!user && user.groupId === selectedGroup;

  const seasonNameOf = (seasonId?: number | null) =>
    seasonId == null ? null : (seasons.find((s) => s.id === seasonId)?.name ?? null);

  useEffect(() => {
    if (selectedGroup) {
      loadInProgressGames();
      loadFinishedInitial();
      loadTeams();
    }
    setLoading(false);
  }, [selectedGroup]);

  // 경기 카드의 시즌 배지와 선택 모드 드롭다운에 쓴다.
  useEffect(() => {
    if (!selectedGroup) {
      setSeasons([]);
      return;
    }
    fetchSeasons(selectedGroup)
      .then((data) => setSeasons(data.seasons))
      .catch((e) => {
        // 시즌 조회 실패는 배지만 사라질 뿐 경기 목록에는 영향이 없다.
        console.error("시즌 목록을 불러오지 못했습니다:", e);
        setSeasons([]);
      });
  }, [selectedGroup]);

  const loadTeams = async () => {
    if (!selectedGroup) return;
    try {
      const serverTeams = await fetchTeams(selectedGroup);
      setTeams(serverTeams);
    } catch (error) {
      console.error("팀 목록을 불러오는데 실패했습니다:", error);
      showToast("팀 목록을 불러오지 못했습니다.", "error");
    }
  };

  const loadInProgressGames = async () => {
    try {
      const response = await api.get(`/game`, {
        params: { groupId: selectedGroup, status: 'IN_PROGRESS' },
      });
      const data = response.data;
      setInProgressGames(Array.isArray(data) ? data : (data.games ?? []));
    } catch (error) {
      console.error("진행 중인 게임 목록을 불러오는데 실패했습니다:", error);
      showToast("진행 중인 게임 목록을 불러오지 못했습니다.", "error");
    }
  };

  const loadFinishedInitial = async () => {
    finishedPageRef.current = 0;
    finishedLoadingRef.current = false;
    setFinishedGames([]);
    setHasMoreFinished(false);

    finishedLoadingRef.current = true;
    try {
      const response = await api.get(`/game`, {
        params: { groupId: selectedGroup, status: 'FINISHED', page: 1, limit: FINISHED_PAGE_SIZE },
      });
      const data = response.data;
      const games = Array.isArray(data) ? data : (data.games ?? []);
      const hasMore = Array.isArray(data) ? false : (data.hasMore ?? false);
      setFinishedGames(games);
      setHasMoreFinished(hasMore);
      finishedPageRef.current = 1;
    } catch (error) {
      console.error("완료된 게임 목록을 불러오는데 실패했습니다:", error);
      showToast("완료된 게임 목록을 불러오지 못했습니다.", "error");
    } finally {
      finishedLoadingRef.current = false;
    }
  };

  const loadMoreFinished = useCallback(async () => {
    if (!hasMoreFinished || finishedLoadingRef.current || !selectedGroup) return;
    finishedLoadingRef.current = true;
    setLoadingMoreFinished(true);

    const nextPage = finishedPageRef.current + 1;
    try {
      const response = await api.get(`/game`, {
        params: { groupId: selectedGroup, status: 'FINISHED', page: nextPage, limit: FINISHED_PAGE_SIZE },
      });
      const data = response.data;
      const games = Array.isArray(data) ? data : (data.games ?? []);
      const hasMore = Array.isArray(data) ? false : (data.hasMore ?? false);
      setFinishedGames((prev) => [...prev, ...games]);
      setHasMoreFinished(hasMore);
      finishedPageRef.current = nextPage;
    } catch (error) {
      console.error("추가 완료 게임 로드 실패:", error);
      showToast("게임 목록을 더 불러오지 못했습니다.", "error");
    } finally {
      finishedLoadingRef.current = false;
      setLoadingMoreFinished(false);
    }
  }, [hasMoreFinished, selectedGroup]);

  useEffect(() => {
    const el = finishedSentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreFinished();
        }
      },
      { rootMargin: "300px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMoreFinished]);

  const enterSelectMode = () => {
    setSelectMode(true);
    setSelectedGameIds(new Set());
  };

  // 선택 관련 상태를 전부 초기화하고 원래 페이징 목록으로 되돌린다.
  // 선택 모드 취소와 배정 성공 후 둘 다 같은 정리가 필요하다 — 한쪽만
  // 고치면 날짜 범위 상태(rangeApplied 등)가 남아 목록이 그 범위에 갇힌다.
  const resetSelectModeState = () => {
    setSelectedGameIds(new Set());
    setRangeFrom("");
    setRangeTo("");
    setRangeApplied(false);
    loadFinishedInitial();
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    resetSelectModeState();
  };

  const toggleGame = (gameId: number) => {
    setSelectedGameIds((prev) => {
      const next = new Set(prev);
      if (next.has(gameId)) next.delete(gameId);
      else next.add(gameId);
      return next;
    });
  };

  // '전체'는 항상 "지금 화면에 로드된 경기 전체"를 뜻한다.
  const allLoadedSelected =
    finishedGames.length > 0 && selectedGameIds.size === finishedGames.length;

  const toggleSelectAll = () => {
    setSelectedGameIds(
      allLoadedSelected ? new Set() : new Set(finishedGames.map((g) => g.id))
    );
  };

  const applyRange = async () => {
    if (!selectedGroup) return;
    if (!rangeFrom || !rangeTo) {
      showToast("시작일과 종료일을 모두 입력해주세요.", "error");
      return;
    }
    if (rangeFrom > rangeTo) {
      showToast("시작일이 종료일보다 뒤일 수 없습니다.", "error");
      return;
    }
    try {
      const games = await fetchFinishedGamesInRange(selectedGroup, rangeFrom, rangeTo);
      setFinishedGames(games);
      setHasMoreFinished(false); // 범위 조회는 페이징 없이 전부 받는다
      setRangeApplied(true);
      setSelectedGameIds(new Set());
    } catch (error) {
      console.error("범위 조회에 실패했습니다:", error);
      showToast("해당 기간의 경기를 불러오지 못했습니다.", "error");
    }
  };

  const clearRange = () => {
    setRangeFrom("");
    setRangeTo("");
    setRangeApplied(false);
    setSelectedGameIds(new Set());
    loadFinishedInitial();
  };

  const handleAssignSeason = async (seasonId: number | null) => {
    if (!selectedGroup || selectedGameIds.size === 0) return;

    const seasonName =
      seasonId === null
        ? "시즌 미지정"
        : (seasons.find((s) => s.id === seasonId)?.name ?? "선택한 시즌");
    const ok = await confirm({
      title: "시즌을 배정할까요?",
      message: `완료 경기 ${selectedGameIds.size}건을 '${seasonName}'(으)로 옮깁니다.`,
      confirmText: "배정",
    });
    if (!ok) return;

    setAssigning(true);
    try {
      const { updated } = await assignGameSeason(
        selectedGroup,
        Array.from(selectedGameIds),
        seasonId
      );
      showToast(`${updated}건을 '${seasonName}'(으)로 배정했습니다.`, "success");
      setSelectMode(false);
      // exitSelectMode와 동일한 정리 — 날짜 범위를 적용한 채 배정했다면
      // 그 상태로 목록이 갇히지 않도록 페이징 목록으로 되돌리고, 그 재조회가
      // 배지도 함께 갱신해준다.
      resetSelectModeState();
    } catch (error: any) {
      const message = error?.response?.data?.message;
      // DTO 검증 실패(400)는 ValidationPipe가 message를 string[]로 준다 —
      // 배열을 그대로 Toast에 넘기면 구분자 없이 붙어버리므로 한 문장으로 합친다.
      const text = Array.isArray(message)
        ? message.join(" / ")
        : (message ?? "시즌 배정에 실패했습니다.");
      showToast(text, "error");
    } finally {
      setAssigning(false);
    }
  };

  const handleCreateGame = async () => {
    if (!canManage) {
      showToast("게임 생성은 로그인이 필요합니다.", "error");
      return;
    }
    if (!selectedGroup || !selectedTeams.teamA || !selectedTeams.teamB) {
      showToast("Home팀과 Away팀을 모두 선택해주세요.", "error");
      return;
    }

    try {
      const response = await api.post("/game", {
        groupId: selectedGroup,
        homeTeamName: selectedTeams.teamA.name,
        awayTeamName: selectedTeams.teamB.name,
        homePlayers: selectedTeams.teamA.players,
        awayPlayers: selectedTeams.teamB.players,
        status: "IN_PROGRESS",
      }, {
        headers: {
          Authorization: `Bearer ${user?.accessToken}`,
        },
      });

      const newGame = {
        id: response.data.gameId,
        groupId: selectedGroup,
        homeTeamName: selectedTeams.teamA.name,
        awayTeamName: selectedTeams.teamB.name,
        date: new Date(),
        status: "IN_PROGRESS",
        homePlayers: selectedTeams.teamA.players.map(player => ({
          id: player.id,
          name: player.name,
          team: 'home'
        })),
        awayPlayers: selectedTeams.teamB.players.map(player => ({
          id: player.id,
          name: player.name,
          team: 'away'
        })),
        logs: []
      };

      setInProgressGames(prev => [newGame as unknown as Game, ...prev]);
      setIsCreateModalOpen(false);
      setSelectedTeams({});
      showToast("게임이 생성되었습니다. 카드를 눌러 기록을 시작하세요.", "success");
    } catch (error) {
      console.error("게임 생성에 실패했습니다:", error);
      // 402(SUBSCRIPTION_REQUIRED)는 axios 인터셉터가 이미 토스트 + 리다이렉트를
      // 처리하므로 여기서 중복 토스트를 띄우지 않는다.
      const isAxiosLikeError =
        typeof error === "object" && error !== null && "response" in error;
      const status = isAxiosLikeError
        ? (error as { response?: { status?: number } }).response?.status
        : undefined;
      if (status !== 402) {
        showToast("게임 생성에 실패했습니다. 다시 시도해주세요.", "error");
      }
    }
  };

  const handleFinishGame = async (gameId: number) => {
    if (!canManage) return;
    const game = inProgressGames.find(g => g.id === gameId);
    const ok = await confirm({
      title: "게임 종료",
      message: `${game ? `${game.homeTeamName} vs ${game.awayTeamName} ` : ""}게임을 종료하시겠습니까?\n종료된 게임은 통계에 반영됩니다.`,
      confirmText: "종료",
    });
    if (!ok) return;

    try {
      const res = await api.patch(`/game/${gameId}`, {
        status: "FINISHED",
      }, {
        headers: {
          Authorization: `Bearer ${user?.accessToken}`,
        },
      });

      if (res.status === 200) {
        setInProgressGames(prev => prev.filter(g => g.id !== gameId));
        if (game) {
          setFinishedGames(prev => [{ ...game, status: "FINISHED" }, ...prev]);
        }
        showToast("게임이 종료되었습니다.", "success");
      }
    } catch (error) {
      console.error("게임 종료에 실패했습니다:", error);
      showToast("게임 종료에 실패했습니다. 다시 시도해주세요.", "error");
    }
  };

  const handleDeleteGame = async (gameId: number) => {
    if (!canManage) return;
    const game = [...inProgressGames, ...finishedGames].find(g => g.id === gameId);
    const ok = await confirm({
      title: "게임 삭제",
      message: `${game ? `${game.homeTeamName} vs ${game.awayTeamName} ` : ""}게임을 삭제하시겠습니까?\n삭제된 게임과 기록은 복구할 수 없습니다.`,
      confirmText: "삭제",
      danger: true,
    });
    if (!ok) return;

    try {
      const res = await api.delete(`/game/${gameId}`, {
        headers: {
          Authorization: `Bearer ${user?.accessToken}`,
        },
      });

      if (res.status === 200) {
        setInProgressGames(prev => prev.filter(g => g.id !== gameId));
        setFinishedGames(prev => prev.filter(g => g.id !== gameId));
        showToast("게임이 삭제되었습니다.", "success");
      }
    } catch (error) {
      console.error("게임 삭제에 실패했습니다:", error);
      showToast("게임 삭제에 실패했습니다. 다시 시도해주세요.", "error");
    }
  };

  const handleRestartGame = async (gameId: number) => {
    if (!canManage) return;
    const ok = await confirm({
      title: "게임 다시 진행",
      message: "이 게임을 다시 진행 중인 게임으로 변경하시겠습니까?",
      confirmText: "다시 진행",
    });
    if (!ok) return;

    try {
      await api.patch(`/game/${gameId}`, {
        status: "IN_PROGRESS",
      }, {
        headers: {
          Authorization: `Bearer ${user?.accessToken}`,
        },
      });

      const game = finishedGames.find(g => g.id === gameId);
      setFinishedGames(prev => prev.filter(g => g.id !== gameId));
      if (game) {
        setInProgressGames(prev => [{ ...game, status: "IN_PROGRESS" }, ...prev]);
      }
      showToast("게임이 진행 중 상태로 변경되었습니다.", "success");
    } catch (error) {
      console.error("게임 상태 변경에 실패했습니다:", error);
      showToast("게임 상태 변경에 실패했습니다. 다시 시도해주세요.", "error");
    }
  };

  const handleGameClick = (gameId: number) => {
    router.push(`/record/${gameId}`);
  };

  if (!mounted) return null;

  if (!selectedGroup) {
    return <NoGroupSelected />;
  }

  if (loading) {
    return (
      <LoadingContainer>
        <Spinner />
      </LoadingContainer>
    );
  }

  return (
    <Container>
      <Header>
        <Title>게임 관리</Title>
        <CreateGameButton onClick={() => setIsCreateModalOpen(true)} disabled={!canManage}>
          새 게임 생성
        </CreateGameButton>
      </Header>

      {subStatus && subStatus.monetizationStarted && !subStatus.subscribed && subStatus.remainingFreeGames <= 3 && (
        <span style={{ fontSize: "0.85rem", color: "#b45309", display: "block", padding: "0 1rem 1rem 1rem" }}>
          무료 경기 생성 {subStatus.remainingFreeGames}회 남음
        </span>
      )}

      {!canManage && (
        <LoginBanner>
          <span>
            {user
              ? "내 소속 그룹을 선택하면 게임을 생성하고 관리할 수 있습니다."
              : "게임 생성·종료·삭제는 로그인이 필요합니다."}
          </span>
          {!user && <Link href="/settings">로그인하기</Link>}
        </LoginBanner>
      )}

      <Content>
        <Section>
          <SectionTitle>진행 중인 게임</SectionTitle>
          <GameList>
            {inProgressGames.map((game) => (
              <GameCard
                key={game.id}
                onClick={() => handleGameClick(game.id)}
                style={{ cursor: 'pointer' }}
              >
                <GameInfo>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <GameName>{`${game.homeTeamName} vs ${game.awayTeamName}`}</GameName>
                    <GameStatusBadge>진행중</GameStatusBadge>
                  </div>
                  <GameDate>{new Date(game.date).toLocaleDateString("ko-KR")}</GameDate>
                </GameInfo>

                <TeamsContainer>
                  <TeamSection>
                    <TeamLabel>{`홈팀 (${game.homeTeamName})`}</TeamLabel>
                    <PlayerList>
                      {(game.homePlayers ?? []).map((player) => (
                        <PlayerTag key={player.id}>{player.name}</PlayerTag>
                      ))}
                    </PlayerList>
                  </TeamSection>

                  <TeamSection>
                    <TeamLabel>{`어웨이팀 (${game.awayTeamName})`}</TeamLabel>
                    <PlayerList>
                      {(game.awayPlayers ?? []).map((player) => (
                        <PlayerTag key={player.id}>{player.name}</PlayerTag>
                      ))}
                    </PlayerList>
                  </TeamSection>
                </TeamsContainer>

                {canManage && (
                  <GameActions style={{ marginTop: '1rem' }}>
                    <ActionButton
                      onClick={(e) => { e.stopPropagation(); handleFinishGame(game.id); }}
                      style={{ backgroundColor: '#facc15', color: '#374151' }}
                    >
                      게임 종료
                    </ActionButton>
                    <ActionButton
                      onClick={(e) => { e.stopPropagation(); handleDeleteGame(game.id); }}
                      style={{ backgroundColor: '#dc2626', color: 'white' }}
                    >
                      삭제
                    </ActionButton>
                  </GameActions>
                )}
              </GameCard>
            ))}
            {inProgressGames.length === 0 && (
              <EmptyStateCard>
                진행 중인 게임이 없습니다.
                {canManage && (
                  <>
                    <br />
                    상단의 <strong>새 게임 생성</strong> 버튼으로 경기를 시작해보세요.
                  </>
                )}
              </EmptyStateCard>
            )}
          </GameList>
        </Section>
        <Section>
          <SectionTitle>
            최근 게임 기록
            {canManage && seasons.length > 0 && !selectMode && (
              <SmallButton style={{ marginLeft: "0.75rem" }} onClick={enterSelectMode}>
                시즌 배정
              </SmallButton>
            )}
          </SectionTitle>
          {selectMode && (
            <SelectToolbar>
              <RangeRow>
                <DateInput
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  aria-label="시작일"
                />
                <span>~</span>
                <DateInput
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  aria-label="종료일"
                />
                <SmallButton onClick={applyRange}>기간 적용</SmallButton>
                {rangeApplied && <SmallButton onClick={clearRange}>기간 해제</SmallButton>}
              </RangeRow>

              <SelectAllRow>
                <input
                  type="checkbox"
                  checked={allLoadedSelected}
                  onChange={toggleSelectAll}
                />
                전체 선택 ({finishedGames.length}건)
              </SelectAllRow>

              {!rangeApplied && hasMoreFinished && (
                <MoreHint>
                  아래로 더 있습니다 — 날짜 범위를 지정하면 한 번에 고를 수 있습니다.
                </MoreHint>
              )}
            </SelectToolbar>
          )}
          <GameList>
            {finishedGames.map((game) => (
              <GameCard
                key={game.id}
                onClick={selectMode ? () => toggleGame(game.id) : undefined}
                style={
                  selectMode
                    ? {
                        cursor: "pointer",
                        outline: selectedGameIds.has(game.id)
                          ? "2px solid var(--primary-color)"
                          : undefined,
                      }
                    : undefined
                }
              >
                {selectMode && (
                  <SelectCheckbox
                    type="checkbox"
                    checked={selectedGameIds.has(game.id)}
                    onChange={() => toggleGame(game.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="이 경기 선택"
                  />
                )}
                <GameInfo>
                  <GameName>
                    {`${game.homeTeamName} vs ${game.awayTeamName}`}
                    {seasonNameOf(game.seasonId) && (
                      <SeasonBadge>{seasonNameOf(game.seasonId)}</SeasonBadge>
                    )}
                  </GameName>
                  <GameDate>{new Date(game.date).toLocaleDateString("ko-KR")}</GameDate>
                </GameInfo>

                <TeamsContainer>
                  <TeamSection>
                    <TeamLabel>{`홈팀 (${game.homeTeamName})`}</TeamLabel>
                    <PlayerList>
                      {(game.homePlayers ?? []).map((player) => (
                        <PlayerTag key={player.id}>{player.name}</PlayerTag>
                      ))}
                    </PlayerList>
                  </TeamSection>

                  <TeamSection>
                    <TeamLabel>{`어웨이팀 (${game.awayTeamName})`}</TeamLabel>
                    <PlayerList>
                      {(game.awayPlayers ?? []).map((player) => (
                        <PlayerTag key={player.id}>{player.name}</PlayerTag>
                      ))}
                    </PlayerList>
                  </TeamSection>
                </TeamsContainer>

                {canManage && !selectMode && (
                  <GameActions style={{ marginTop: '1rem' }}>
                    <ActionButton onClick={() => handleRestartGame(game.id)}>
                      다시 진행하기
                    </ActionButton>
                    <ActionButton
                      onClick={(e) => { e.stopPropagation(); handleDeleteGame(game.id); }}
                      style={{ backgroundColor: '#dc2626', color: 'white' }}
                    >
                      삭제
                    </ActionButton>
                  </GameActions>
                )}
              </GameCard>
            ))}
            {finishedGames.length === 0 && (
              <EmptyStateCard>완료된 게임이 없습니다.</EmptyStateCard>
            )}
            <div ref={finishedSentinelRef}>
              {loadingMoreFinished && (
                <LoadMoreSpinner>
                  <Spinner />
                </LoadMoreSpinner>
              )}
            </div>
          </GameList>
        </Section>
      </Content>

      {isCreateModalOpen && (
        <Modal onClick={() => setIsCreateModalOpen(false)}>
          <ModalContent role="dialog" aria-modal="true" aria-label="새 게임 생성" onClick={(e) => e.stopPropagation()}>
            <ModalTitle>새 게임 생성</ModalTitle>
            {teams.length === 0 ? (
              <NoTeamsGuide>
                아직 구성된 팀이 없습니다.
                <br />
                먼저 <strong>팀 관리</strong>에서 선수를 추가하고 팀을 만들어주세요.
                <br />
                이전에 다른 기기에서 만든 팀 구성이 있다면, 그 기기에서 팀 관리에 접속하면 서버로 옮길 수 있습니다.
                <br />
                <Link href="/teams">팀 관리로 이동</Link>
              </NoTeamsGuide>
            ) : (
              <>
                <Input
                  type="text"
                  placeholder="게임 이름"
                  value={`${selectedTeams.teamA?.name || ""} vs ${selectedTeams.teamB?.name || ""}`}
                  disabled
                />
                <Select
                  value={selectedTeams.teamA?.id || ""}
                  onChange={(e) => {
                    const team = teams.find((t) => t.id === Number(e.target.value));
                    setSelectedTeams({ ...selectedTeams, teamA: team });
                  }}
                >
                  <option value="">Home팀 선택</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id} disabled={team.id === selectedTeams.teamB?.id}>
                      {team.name}
                    </option>
                  ))}
                </Select>
                <Select
                  value={selectedTeams.teamB?.id || ""}
                  onChange={(e) => {
                    const team = teams.find((t) => t.id === Number(e.target.value));
                    setSelectedTeams({ ...selectedTeams, teamB: team });
                  }}
                >
                  <option value="">Away팀 선택</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id} disabled={team.id === selectedTeams.teamA?.id}>
                      {team.name}
                    </option>
                  ))}
                </Select>
              </>
            )}
            <ModalButtons>
              {teams.length > 0 && <ModalButton onClick={handleCreateGame}>생성</ModalButton>}
              <ModalButton onClick={() => setIsCreateModalOpen(false)}>취소</ModalButton>
            </ModalButtons>
          </ModalContent>
        </Modal>
      )}

      {selectMode && (
        <GameSeasonActionBar
          count={selectedGameIds.size}
          seasons={seasons}
          busy={assigning}
          onAssign={handleAssignSeason}
          onCancel={exitSelectMode}
        />
      )}
    </Container>
  );
};

export default GamesPage;
