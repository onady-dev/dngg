"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useGroupStore } from "../stores/groupStore";
import { api } from "@/lib/axios";
import { PlayerRanking } from "@/types/player";
import * as S from "./styles/RankingStyles";
import { FiChevronDown, FiChevronUp } from "react-icons/fi";
import EmptyState from "../components/EmptyState";
import NoGroupSelected from "../components/NoGroupSelected";
import { useMounted } from "../lib/useMounted";
import SeasonSelector from "../components/SeasonSelector";
import { useSeasonStore, resolveSeasonSelection, seasonQuery, SeasonSelection } from "../stores/seasonStore";
import { fetchSeasons, Season } from "@/lib/seasonApi";
import { useAuthStore } from "../stores/useAuthStore";

interface LogItemRanking {
  id: number;
  name: string;
  value: number;
  players: PlayerRanking[];
  isExpanded?: boolean;
  totalCount?: number;
  avgPerGame?: number;
  totalScore?: number;
  avgScore?: number;
  gamesPlayed?: number;
}

export default function Rankings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLogItem, setSelectedLogItem] = useState<number | null>(null);
  const [selectedTab, setSelectedTab] = useState<"total" | "average">("total");
  const [rankings, setRankings] = useState<LogItemRanking[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [currentSeasonId, setCurrentSeasonId] = useState<number | null>(null);
  const [selection, setSelection] = useState<SeasonSelection>("all");

  const { selectedGroup, setSelectedGroup, groups, setGroups } = useGroupStore();
  const { selectionByGroup, setSelection: persistSelection } = useSeasonStore();
  const user = useAuthStore((state) => state.user);
  const canManage = !!user && user.groupId === selectedGroup;
  const mounted = useMounted();

  // 그룹 목록 가져오기
  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const response = await api.get("/group/all");
        const groupData = response.data;
        setGroups(groupData);
      } catch (err) {
        console.error("그룹 데이터를 불러오는데 실패했습니다:", err);
        setError("그룹 데이터를 불러오는데 실패했습니다.");
      }
    };

    fetchGroups();
  }, []);

  // 펼치기/접기 토글 함수
  const toggleExpand = (rankingId: number) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(rankingId)) {
        newSet.delete(rankingId);
      } else {
        newSet.add(rankingId);
      }
      return newSet;
    });
  };

  // 시즌 목록을 받아 저장된 선택을 해석한다.
  const loadSeasons = React.useCallback(async () => {
    if (!selectedGroup) return;
    try {
      const data = await fetchSeasons(selectedGroup);
      setSeasons(data.seasons);
      setCurrentSeasonId(data.currentSeasonId);
      setSelection(
        resolveSeasonSelection(
          selectionByGroup[selectedGroup],
          data.seasons,
          data.currentSeasonId
        )
      );
    } catch (err) {
      // 시즌 조회 실패는 전체 기간으로 폴백한다 — 랭킹 자체는 보여준다.
      console.error("시즌 목록을 불러오지 못했습니다:", err);
      setSeasons([]);
      setCurrentSeasonId(null);
      setSelection("all");
    }
  }, [selectedGroup, selectionByGroup]);

  useEffect(() => {
    loadSeasons();
  }, [selectedGroup]);

  // 랭킹 데이터 가져오기
  useEffect(() => {
    const fetchRankings = async () => {
      if (!selectedGroup) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const response = await api.get(
          `/log/rankings?groupId=${selectedGroup}${seasonQuery(selection)}`
        );
        setRankings(response.data.rankings ?? []);
      } catch (err) {
        console.error("랭킹 데이터를 불러오는데 실패했습니다:", err);
        setError("랭킹 데이터를 불러오는데 실패했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchRankings();
  }, [selectedGroup, selection]);

  const handleSeasonChange = (next: SeasonSelection) => {
    setSelection(next);
    if (selectedGroup) persistSelection(selectedGroup, next);
  };

  const handleLogItemClick = (logItemId: number) => {
    setSelectedLogItem(selectedLogItem === logItemId ? null : logItemId);
  };

  if (!mounted) return null;

  // 그룹이 선택되지 않은 경우의 UI
  if (!selectedGroup && !loading) {
    return <NoGroupSelected />;
  }

  // 로딩 중인 경우의 UI
  if (loading) {
    return (
      <S.Container>
        <S.LoadingSpinner>로딩 중...</S.LoadingSpinner>
      </S.Container>
    );
  }

  // 에러가 발생한 경우의 UI
  if (error) {
    return (
      <S.Container>
        <S.ErrorMessage>{error}</S.ErrorMessage>
      </S.Container>
    );
  }

  const filteredRankings = rankings.map((ranking) => ({
    ...ranking,
    players: [...ranking.players].sort((a, b) => {
      if (ranking.value < 0) {
        return selectedTab === "total" ? a.totalCount! - b.totalCount! : a.avgPerGame! - b.avgPerGame!;
      }
      if (ranking.name === "득점") {
        return selectedTab === "total" ? b.totalScore! - a.totalScore! : b.avgScore! - a.avgScore!;
      }
      return selectedTab === "total" ? b.totalCount! - a.totalCount! : b.avgPerGame! - a.avgPerGame!;
    }),
  }));

  return (
    <S.Container>
      {selectedGroup && (
        <SeasonSelector
          groupId={selectedGroup}
          seasons={seasons}
          currentSeasonId={currentSeasonId}
          selection={selection}
          canManage={canManage}
          onChange={handleSeasonChange}
          onSeasonsChanged={loadSeasons}
        />
      )}

      <S.Header>
        <S.TabContainer>
          <S.TabButton isSelected={selectedTab === "total"} onClick={() => setSelectedTab("total")}>
            전체 기록
          </S.TabButton>
          <S.TabButton isSelected={selectedTab === "average"} onClick={() => setSelectedTab("average")}>
            게임당 평균
          </S.TabButton>
        </S.TabContainer>
      </S.Header>

      {filteredRankings.length === 0 && (
        <EmptyState message="이 기간에는 기록이 없습니다." />
      )}

      {filteredRankings.map((ranking) => (
        <S.RankingCard key={ranking.id}>
          <S.RankingHeader isExpanded={expandedItems.has(ranking.id)} onClick={() => toggleExpand(ranking.id)}>
            <S.RankingTitle>
              {ranking.name}
              {ranking.players.length > 3 && (expandedItems.has(ranking.id) ? <FiChevronUp /> : <FiChevronDown />)}
            </S.RankingTitle>
          </S.RankingHeader>

          <S.TopThree>
            {ranking.players.slice(0, 3).map((player, index) => (
              <Link key={player.playerId} href={`/player/${player.playerId}`} style={{ textDecoration: "none" }}>
                <S.PlayerItem isTop>
                  <S.Rank isTop>{index + 1}</S.Rank>
                  <S.PlayerInfo>
                    <S.PlayerName>{player.playerName}</S.PlayerName>
                    <S.PlayerBadge>#{player.number}</S.PlayerBadge>
                  </S.PlayerInfo>
                  <S.StatValue isPositive={ranking.value >= 0}>
                    {selectedTab === "total"
                      ? `${player.totalCount}${ranking.name === "득점" ? "점" : "회"}`
                      : `${player.avgPerGame?.toFixed(1)}${ranking.name === "득점" ? "점" : "회"}`}
                  </S.StatValue>
                </S.PlayerItem>
              </Link>
            ))}
          </S.TopThree>

          <S.RankingContent isExpanded={expandedItems.has(ranking.id)}>
            <S.PlayerList>
              {ranking.players.slice(3).map((player, index) => (
                <Link key={player.playerId} href={`/player/${player.playerId}`} style={{ textDecoration: "none" }}>
                  <S.PlayerItem>
                    <S.Rank>{index + 4}</S.Rank>
                    <S.PlayerInfo>
                      <S.PlayerName>{player.playerName}</S.PlayerName>
                      <S.PlayerBadge>#{player.number}</S.PlayerBadge>
                    </S.PlayerInfo>
                    <S.StatValue isPositive={ranking.value >= 0}>
                      {selectedTab === "total"
                        ? `${player.totalCount}${ranking.name === "득점" ? "점" : "회"}`
                        : `${player.avgPerGame?.toFixed(1)}${ranking.name === "득점" ? "점" : "회"}`}
                    </S.StatValue>
                  </S.PlayerItem>
                </Link>
              ))}
            </S.PlayerList>
          </S.RankingContent>
        </S.RankingCard>
      ))}
    </S.Container>
  );
}
