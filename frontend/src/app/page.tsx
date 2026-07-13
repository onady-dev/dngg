"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Game } from "@/types/game";
import { api } from "@/lib/axios";
import { useGroupStore } from "./stores/groupStore";
import { useAuthStore } from "./stores/useAuthStore";
import * as S from "./styles/HomeStyles";
import { Player } from "@/types/player";
import styled from "styled-components";
import OnboardingChecklist from "./components/OnboardingChecklist";

const PAGE_SIZE = 5;

const PlayerRecordContainer = styled.div`
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: background-color 0.2s ease;
  border-radius: 4px;

  &:hover {
    background-color: #f9fafb;
  }
`;

const LoadMoreSpinner = styled.div`
  display: flex;
  justify-content: center;
  padding: 1.5rem;
`;

const InProgressBanner = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  background-color: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: #065f46;
  font-weight: 500;

  &:hover {
    background-color: #d1fae5;
  }

  span.action {
    color: #047857;
    font-weight: 700;
    white-space: nowrap;
  }
`;

const GuideButton = styled.a`
  display: inline-block;
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background-color: var(--primary-color);
  color: white;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 600;

  &:hover {
    background-color: var(--hover-color);
  }
`;

interface LogSummary {
  name: string;
  count: number;
  value: number;
  logitemId: number;
}

interface PlayerStats {
  playerId: number;
  playerName: string;
  stats: LogSummary[];
}

export default function Home() {
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerStats | null>(null);
  const { selectedGroup, setGroups } = useGroupStore();
  const user = useAuthStore((state) => state.user);
  const [mounted, setMounted] = useState(false);
  const [inProgressGames, setInProgressGames] = useState<Game[]>([]);

  // 진행중 경기 배너는 내 소속 그룹을 보고 있을 때만 노출한다.
  const canManage = !!user && user.groupId === selectedGroup;

  const pageRef = useRef(0);
  const isLoadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const response = await api.get("/group/all");
        setGroups(response.data);
      } catch (err) {
        console.error("그룹 목록을 불러오는데 실패했습니다:", err);
      }
    };
    fetchGroups();
  }, []);

  useEffect(() => {
    if (!selectedGroup) return;

    pageRef.current = 0;
    isLoadingRef.current = false;
    setGames([]);
    setHasMore(false);
    setError(null);
    setLoading(true);

    const fetchInitial = async () => {
      isLoadingRef.current = true;
      try {
        const response = await api.get("/game", {
          params: { groupId: selectedGroup, page: 1, limit: PAGE_SIZE },
        });
        const data = response.data;
        const newGames = Array.isArray(data) ? data : (data.games ?? []);
        const more = Array.isArray(data) ? false : (data.hasMore ?? false);
        setGames(newGames);
        setHasMore(more);
        pageRef.current = 1;
      } catch (err) {
        setError("게임 목록을 불러오는데 실패했습니다.");
      } finally {
        isLoadingRef.current = false;
        setLoading(false);
      }
    };

    fetchInitial();

    const fetchInProgress = async () => {
      try {
        const response = await api.get("/game", {
          params: { groupId: selectedGroup, status: "IN_PROGRESS" },
        });
        const data = response.data;
        setInProgressGames(Array.isArray(data) ? data : (data.games ?? []));
      } catch (err) {
        console.error("진행 중인 게임 조회 실패:", err);
      }
    };
    if (canManage) {
      fetchInProgress();
    } else {
      setInProgressGames([]);
    }
  }, [selectedGroup, canManage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingRef.current || !selectedGroup) return;
    isLoadingRef.current = true;
    setLoadingMore(true);

    const nextPage = pageRef.current + 1;
    try {
      const response = await api.get("/game", {
        params: { groupId: selectedGroup, page: nextPage, limit: PAGE_SIZE },
      });
      const data = response.data;
      const newGames = Array.isArray(data) ? data : (data.games ?? []);
      const more = Array.isArray(data) ? false : (data.hasMore ?? false);
      setGames((prev) => [...prev, ...newGames]);
      setHasMore(more);
      pageRef.current = nextPage;
    } catch (err) {
      console.error("추가 게임 로드 실패:", err);
    } finally {
      isLoadingRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, selectedGroup]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "300px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const getPlayerLogSummary = (game: Game, playerId: number): LogSummary[] => {
    const playerLogs = game.logs.filter((log) => log.playerId === playerId);
    const logSummary = new Map<string, LogSummary>();

    playerLogs.forEach((log) => {
      const key = log.logitem.name;
      const existing = logSummary.get(key);
      if (existing) {
        existing.count += 1;
        existing.value += log.logitem.value;
      } else {
        logSummary.set(key, {
          name: key,
          count: 1,
          value: log.logitem.value,
          logitemId: log.logitemId,
        });
      }
    });

    return Array.from(logSummary.values()).sort((a, b) => a.logitemId - b.logitemId);
  };

  const getPlayerScore = (game: Game, playerId: number): number => {
    return game.logs.filter((log) => log.playerId === playerId).reduce((sum, log) => sum + log.logitem.value, 0);
  };

  const renderPlayerLogs = (game: Game, player: Player) => {
    const logSummary = getPlayerLogSummary(game, player.id);
    if (logSummary.length === 0) return null;

    return (
      <S.LogContainer>
        {logSummary.map((summary) => {
          const isNegative = ["파울", "턴오버"].includes(summary.name);
          return (
            <S.LogBadge key={summary.name} isNegative={isNegative}>
              {summary.name}
              <S.BadgeCount>{summary.count}회</S.BadgeCount>
            </S.LogBadge>
          );
        })}
      </S.LogContainer>
    );
  };

  const handlePlayerClick = (player: Player) => {
    router.push(`/player/${player.id}`);
  };

  const PlayerStatsModal = () => {
    if (!selectedPlayer) return null;

    return (
      <S.ModalOverlay onClick={() => setSelectedPlayer(null)}>
        <S.ModalContainer onClick={(e) => e.stopPropagation()}>
          <S.ModalHeader>
            <S.ModalTitle>{selectedPlayer.playerName}님의 전체 기록</S.ModalTitle>
            <S.CloseButton onClick={() => setSelectedPlayer(null)}>✕</S.CloseButton>
          </S.ModalHeader>
          <S.ModalContent>
            <S.StatsList>
              {selectedPlayer.stats.map((stat) => (
                <S.StatItem key={stat.logitemId}>
                  <S.StatName>{stat.name}</S.StatName>
                  <S.StatValue>{stat.count}회</S.StatValue>
                </S.StatItem>
              ))}
              {selectedPlayer.stats.length === 0 && <p style={{ color: "#6B7280", textAlign: "center", padding: "1rem" }}>기록이 없습니다.</p>}
            </S.StatsList>
          </S.ModalContent>
        </S.ModalContainer>
      </S.ModalOverlay>
    );
  };

  const renderTeamPlayers = (game: Game, team: "home" | "away") => {
    const players = team === "home" ? game.homePlayers : game.awayPlayers;

    const sortedPlayers = [...players].sort((a, b) => {
      const scoreA = getPlayerScore(game, a.id);
      const scoreB = getPlayerScore(game, b.id);
      return scoreB - scoreA;
    });

    return (
      <S.TeamContainer>
        <S.TeamTitle>{team === "home" ? "홈팀" : "어웨이팀"}</S.TeamTitle>
        {sortedPlayers.length > 0 ? (
          <S.PlayerList>
            {sortedPlayers.map((player) => (
              <S.PlayerItem key={player.id}>
                <PlayerRecordContainer
                  onClick={() => handlePlayerClick(player)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handlePlayerClick(player);
                    }
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <S.PlayerName>{player.name}</S.PlayerName>
                    <div
                      style={{
                        backgroundColor: "#FEF3C7",
                        color: "#B45309",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        fontWeight: "600",
                        fontSize: "0.8rem",
                      }}
                    >
                      {getPlayerScore(game, player.id)}점
                    </div>
                  </div>
                  {renderPlayerLogs(game, player)}
                </PlayerRecordContainer>
              </S.PlayerItem>
            ))}
          </S.PlayerList>
        ) : (
          <S.NoPlayer>등록된 선수가 없습니다.</S.NoPlayer>
        )}
      </S.TeamContainer>
    );
  };

  const calculateGameScore = (game: Game) => {
    const homeScore = game.logs.filter((log) => game.homePlayers.some((player) => player.id === log.playerId)).reduce((sum, log) => sum + log.logitem.value, 0);
    const awayScore = game.logs.filter((log) => game.awayPlayers.some((player) => player.id === log.playerId)).reduce((sum, log) => sum + log.logitem.value, 0);

    let homeResult: "win" | "lose" | "draw";
    let awayResult: "win" | "lose" | "draw";

    if (homeScore > awayScore) {
      homeResult = "win";
      awayResult = "lose";
    } else if (homeScore < awayScore) {
      homeResult = "lose";
      awayResult = "win";
    } else {
      homeResult = "draw";
      awayResult = "draw";
    }

    return { homeScore, awayScore, homeResult, awayResult };
  };

  const renderGameScore = (game: Game) => {
    const { homeScore, awayScore, homeResult, awayResult } = calculateGameScore(game);

    return (
      <S.GameScoreContainer>
        <S.TeamScoreWrapper result={homeResult}>
          <S.ScoreValue>{homeScore}</S.ScoreValue>
          <S.ResultText result={homeResult}>{homeResult === "win" ? "승리" : homeResult === "lose" ? "패배" : "무승부"}</S.ResultText>
        </S.TeamScoreWrapper>
        <S.VsText>VS</S.VsText>
        <S.TeamScoreWrapper result={awayResult}>
          <S.ScoreValue>{awayScore}</S.ScoreValue>
          <S.ResultText result={awayResult}>{awayResult === "win" ? "승리" : awayResult === "lose" ? "패배" : "무승부"}</S.ResultText>
        </S.TeamScoreWrapper>
      </S.GameScoreContainer>
    );
  };

  if (!mounted) {
    return null;
  }

  if (!selectedGroup) {
    return (
      <S.NoGroupContainer>
        <S.NoGroupContent>
          <S.NoGroupTitle>그룹을 선택해주세요</S.NoGroupTitle>
          <S.NoGroupText>
            상단의 그룹 선택 메뉴에서 원하는 그룹을 선택하면 해당 그룹의 게임 기록을 볼 수 있습니다.
            경기 기록·선수 관리 등 쓰기 기능은 로그인 후 이용할 수 있습니다.
          </S.NoGroupText>
          <S.UpArrow>↑</S.UpArrow>
          <GuideButton href="/manual/index.html">📖 처음이신가요? 사용 가이드 보기</GuideButton>
        </S.NoGroupContent>
      </S.NoGroupContainer>
    );
  }

  if (loading) {
    return (
      <S.LoadingContainer>
        <S.LoadingSpinner />
      </S.LoadingContainer>
    );
  }

  if (error) {
    return <S.ErrorContainer>{error}</S.ErrorContainer>;
  }

  return (
    <S.Container>
      <S.GameList>
        {canManage && inProgressGames.length > 0 && (
          <InProgressBanner href="/games">
            <span>🏀 진행 중인 경기가 {inProgressGames.length}건 있습니다.</span>
            <span className="action">이어서 기록하기 →</span>
          </InProgressBanner>
        )}
        <OnboardingChecklist hasGames={games.length > 0} />
        {games.map((game) => (
          <S.GameCard key={game.id}>
            <S.GameHeader>
              <S.GameHeaderContent>
                <S.GameInfo>
                  <S.TitleContainer>
                    <S.GameTitle>{`${game.homeTeamName} vs ${game.awayTeamName}`}{game.status === 'IN_PROGRESS' && ' (진행중)'}</S.GameTitle>
                    <S.GameDate>
                      {new Date(game.date).toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "numeric",
                        day: "numeric",
                      })}
                    </S.GameDate>
                  </S.TitleContainer>
                  {renderGameScore(game)}
                </S.GameInfo>
              </S.GameHeaderContent>
            </S.GameHeader>
            <S.GameContent>
              <S.GameGrid>
                {renderTeamPlayers(game, "home")}
                {renderTeamPlayers(game, "away")}
              </S.GameGrid>
            </S.GameContent>
          </S.GameCard>
        ))}
        {games.length === 0 && (
          <S.EmptyState>아직 기록된 게임이 없습니다. 위 시작 가이드를 따라 첫 경기를 기록해보세요.</S.EmptyState>
        )}
        <div ref={sentinelRef}>
          {loadingMore && (
            <LoadMoreSpinner>
              <S.LoadingSpinner />
            </LoadMoreSpinner>
          )}
        </div>
      </S.GameList>
      <PlayerStatsModal />
    </S.Container>
  );
}
