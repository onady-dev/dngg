"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import styled from "styled-components";
import { Game, LogItem, Log } from "@/types/game";
import { api } from "@/lib/axios";
import { useAuthStore } from "@/app/stores/useAuthStore";
import { useToast } from "@/app/components/ui/Toast";

const COACHMARK_STORAGE_KEY = "record_coachmark_seen";

// 쿼터 번호 표시: 1~4는 nQ, 5부터는 연장1, 연장2…
const formatQuarter = (q: number | null | undefined) => {
  const quarter = q ?? 1;
  return quarter <= 4 ? `${quarter}Q` : `연장${quarter - 4}`;
};

const Container = styled.div`
  padding: 0.5rem;
  position: relative;
  min-height: 100vh;
  height: 100%;
  background-color: var(--background-color);
  display: flex;
  flex-direction: column;
  overflow: auto;

  @media (min-width: 768px) {
    padding: 1rem;
  }

  @media (orientation: landscape) and (max-height: 500px) {
    height: auto;
    min-height: calc(100vh + 60px);
    padding-bottom: 70px;
  }
`;

const BackButton = styled.button`
  position: fixed;
  top: 1rem;
  left: 1rem;
  /* 아이콘만 남았으므로 터치 타겟이 44px 아래로 내려가지 않도록 크기를 고정한다 */
  width: 2.25rem;
  height: 2.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f3f4f6;
  border-radius: 0.375rem;
  font-size: 1.125rem;
  line-height: 1;
  color: #374151;
  transition: background-color 0.2s;
  z-index: 1000;

  &:hover {
    background-color: #e5e7eb;
  }

  @media (min-width: 768px) {
    top: 1.5rem;
    left: 1.5rem;
  }
`;

const GameInfoHeader = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 0.5rem;
  /* 뒤로가기 버튼이 좌상단에 고정되어 있어, 가운데 정렬된 경기명이 그 아래로
     밀려들어가지 않도록 양쪽에 같은 폭을 비워 둔다 */
  padding: 0 2.75rem;
`;

const GameName = styled.h2`
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  text-align: center;
`;

const ViewOnlyNotice = styled.div`
  background-color: #fef3c7;
  color: #92400e;
  border-radius: 0.375rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 500;
  margin-bottom: 0.5rem;
`;

const ScoreDisplay = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: bold;
  margin: 0.5rem 0;

  span.score {
    min-width: 1.5rem;
    text-align: center;
  }

  span.vs {
    margin: 0 0.75rem;
    font-size: 1rem;
    color: #6b7280;
    font-weight: 500;
  }
`;

const SwapButton = styled.button`
  padding: 0.5rem 1rem;
  background-color: #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  color: #374151;
  transition: all 0.2s;
  margin-top: 0.5rem;
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: 0.5rem;

  &:hover {
    background-color: #d1d5db;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  &:active {
    transform: translateY(1px);
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.1);
  }

  svg {
    width: 1rem;
    height: 1rem;
  }
`;

const QuarterBar = styled.div`
  display: flex;
  gap: 0.375rem;
  margin-top: 0.5rem;
  align-items: center;
`;

const QuarterChip = styled.button<{ isActive: boolean }>`
  padding: 0.375rem 0.75rem;
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 600;
  background-color: ${props => (props.isActive ? 'var(--primary-color)' : '#e5e7eb')};
  color: ${props => (props.isActive ? 'white' : '#374151')};
  transition: all 0.2s;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
`;

const TeamsContainer = styled.div`
  display: grid;
  grid-template-columns: 1fr 0.75fr 1fr;
  gap: 0.5rem;
  flex: 1;
  min-height: 0;
  height: auto;
  overflow: visible;

  @media (orientation: landscape) and (max-height: 500px) {
    height: auto;
    min-height: 300px;
  }

  /* 세로 모드: 팀을 좌우 2열로, 기록 피드는 아래 전체 폭으로 배치 */
  @media (orientation: portrait) and (max-width: 768px) {
    grid-template-columns: 1fr 1fr;
  }
`;

const TeamSection = styled.div`
  margin-top: 0.5rem;
  &:nth-child(1) {
    /* 홈팀 섹션 스타일 */
    .team-header {
      justify-content: flex-start;

      h3 {
        order: 1;
        margin-right: 0.5rem;
        margin-left: 0;
      }
    }

    /* 홈팀 버튼 스타일 */
    .player-list, .log-items {
      justify-items: start;
    }
  }

  &:nth-child(3) {
    /* 어웨이팀 섹션 스타일 */
    .team-header {
      justify-content: flex-end;
      text-align: right;

      h3 {
        order: 2;
        margin-right: 0;
        margin-left: 0.5rem;
      }
    }

    /* 어웨이팀 버튼 스타일 */
    .player-list, .log-items {
      justify-items: end;
    }

    /* 어웨이팀 버튼 내부 텍스트 정렬 */
    button {
      text-align: center;
    }
  }

  @media (orientation: portrait) and (max-width: 768px) {
    &:nth-child(1) {
      order: 1;
    }
    &:nth-child(3) {
      order: 2;
    }
  }
`;

const PlayerList = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  overflow-y: auto;
  height: auto;
  min-height: 0;
  padding: 0.25rem;

  @media (orientation: landscape) and (max-height: 500px) {
    max-height: none;
  }

  @media (orientation: portrait) and (max-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const PlayerButton = styled.button<{ isSelected: boolean }>`
  position: relative;
  padding: 0.75rem 0.5rem;
  border-radius: 0.75rem;
  font-size: 0.95rem;
  transition: all 0.2s;
  background-color: ${props => props.isSelected ? 'var(--primary-color)' : '#e8f0fe'};
  color: ${props => props.isSelected ? 'white' : '#1a73e8'};
  height: 3rem;
  font-weight: ${props => props.isSelected ? 'bold' : '500'};
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1.2;
  word-break: break-word;
  width: 100%;

  &:hover {
    background-color: ${props => props.isSelected ? 'var(--hover-color)' : '#d3e3fd'};
    transform: translateY(-2px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  &:active {
    transform: translateY(1px);
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.1);
  }

  @media (max-width: 768px) {
    font-size: 0.9rem;
    padding: 0.75rem 0.5rem;
  }
`;

const PlayerBadge = styled.span`
  position: absolute;
  top: 1px;
  right: 1px;
  background: #ef4444;
  color: #fff;
  font-size: 0.75rem;
  font-weight: bold;
  border-radius: 999px;
  padding: 0.1em 0.5em;
  z-index: 2;
  pointer-events: none;
  box-shadow: 0 1px 2px rgba(0,0,0,0.12);
`;

const LogItemsContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  overflow-y: auto;
  height: auto;
  min-height: 0;
  padding: 0.25rem;

  @media (orientation: landscape) and (max-height: 500px) {
    max-height: none;
  }

  @media (orientation: portrait) and (max-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

interface LogItemButtonProps {
  isSelected: boolean;
  hasValue: boolean;
  isNegative: boolean;
}

const LogItemButton = styled.button<LogItemButtonProps>`
  padding: 0.75rem 0.5rem;
  border-radius: 0.75rem;
  font-size: 0.95rem;
  text-align: center;
  transition: all 0.2s;
  background-color: ${props => {
    if (props.isSelected) return 'var(--primary-color)';
    if (props.isNegative) return '#fee2e2';
    return props.hasValue ? '#dcfce7' : '#f3f4f6';
  }};
  color: ${props => {
    if (props.isSelected) return 'white';
    if (props.isNegative) return '#dc2626';
    return props.hasValue ? '#16a34a' : '#374151';
  }};
  height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: ${props => props.isSelected ? 'bold' : 'normal'};
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  line-height: 1.2;
  word-break: break-word;
  width: 100%;

  &:hover {
    background-color: ${props => {
      if (props.isSelected) return 'var(--hover-color)';
      if (props.isNegative) return '#fecaca';
      return props.hasValue ? '#bbf7d0' : '#e5e7eb';
    }};
    transform: translateY(-2px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  &:active {
    transform: translateY(1px);
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.1);
  }

  @media (max-width: 768px) {
    font-size: 0.9rem;
    padding: 0.75rem 0.5rem;
  }
`;

const TeamHeader = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 0.5rem;
  height: 2rem;

  h3 {
    font-size: 1rem;
    font-weight: 500;
    color: #6b7280;
    margin-bottom: 0;
    margin-right: 0.5rem;
  }
`;

const TeamFoulBadge = styled.span`
  background: #fee2e2;
  color: #dc2626;
  border-radius: 999px;
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
`;

const CancelButton = styled.button`
  padding: 0.75rem 1rem;
  background-color: #f3f4f6;
  border-radius: 0.75rem;
  font-size: 0.95rem;
  color: #374151;
  transition: all 0.2s;
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  height: 2.5rem;

  &:hover {
    background-color: #e5e7eb;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  &:active {
    transform: translateY(1px);
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.1);
  }

  @media (max-width: 768px) {
    font-size: 0.9rem;
    padding: 0.75rem 1rem;
  }
`;

const LogHistoryContainer = styled.div`
  background: white;
  border-radius: 0.5rem;
  padding: 0.75rem;
  height: 100%;
  overflow-y: auto; /* 로그 영역만 스크롤 허용 */
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  @media (orientation: portrait) and (max-width: 768px) {
    grid-column: 1 / -1;
    order: 3;
    max-height: 40vh;
    border: 1px solid var(--border-color);
  }
`;

const LogHistoryItem = styled.div`
  display: flex;
  align-items: center;
  padding: 0.5rem;
  border-radius: 0.5rem;
  background-color: #f9fafb;
  font-size: 0.75rem;

  &:nth-child(odd) {
    background-color: #f3f4f6;
  }
`;

const LogHistoryPlayerName = styled.span`
  font-weight: 500;
  margin-right: 0.5rem;
`;

const LogHistoryActionName = styled.span`
  color: #4b5563;
`;

const LogQuarterLabel = styled.span`
  margin-left: auto;
  color: #9ca3af;
  font-size: 0.6875rem;
  flex-shrink: 0;
`;

const HistoryButtonContainer = styled.div`
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin: 0.25rem 0;
  min-height: 20px;
  align-items: center;
`;

const HistoryButton = styled.button`
  padding: 0.5rem;
  border-radius: 0.5rem;
  background-color: #f3f4f6;
  color: #374151;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  height: 2.5rem;
  font-size: 0.8125rem;
  font-weight: 500;

  &:hover {
    background-color: #e5e7eb;
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  svg {
    width: 1.25rem;
    height: 1.25rem;
  }
`;

const CoachmarkOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9500;
  padding: 1.5rem;
`;

const CoachmarkBox = styled.div`
  background: white;
  border-radius: 0.75rem;
  padding: 1.5rem;
  max-width: 360px;
  width: 100%;
  text-align: left;

  h3 {
    font-size: 1.125rem;
    font-weight: 700;
    margin-bottom: 0.75rem;
  }

  ol {
    list-style: decimal;
    padding-left: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.9375rem;
    line-height: 1.5;
    color: #374151;
    margin-bottom: 1.25rem;

    li {
      list-style: decimal;
    }
  }

  button {
    width: 100%;
    padding: 0.625rem;
    background-color: var(--primary-color);
    color: white;
    border-radius: 0.5rem;
    font-weight: 600;

    &:hover {
      background-color: var(--hover-color);
    }
  }
`;

export default function RecordPage() {
  const router = useRouter();
  const params = useParams();
  const user = useAuthStore((state) => state.user);
  const { showToast } = useToast();
  const [game, setGame] = useState<Game | null>(null);
  const [logItems, setLogItems] = useState<LogItem[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);
  const [selectedLogItem, setSelectedLogItem] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<'home' | 'away' | null>(null);
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [foulCount, setFoulCount] = useState<{[playerId: number]: number}>({});
  const [teamFouls, setTeamFouls] = useState<{ home: number; away: number }>({
    home: 0,
    away: 0,
  });
  const [isTeamPositionSwapped, setIsTeamPositionSwapped] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isChangingQuarter, setIsChangingQuarter] = useState(false);
  const [showCoachmark, setShowCoachmark] = useState(false);

  // 기록 입력은 로그인 + 이 경기가 내 소속 그룹의 경기일 때만 허용한다.
  const canRecord = !!user && !!game && user.groupId === game.groupId;

  const fetchGameData = async () => {
    try {
      // 먼저 게임 데이터를 가져옵니다
      const gameResponse = await api.get(`/game/${params.id}`);
      setGame(gameResponse.data);

      // 게임 데이터를 받은 후 logItems를 가져옵니다
      const logItemsResponse = await api.get(`/logitem?groupId=${gameResponse.data.groupId}`);
      setLogItems(logItemsResponse.data);
    } catch (error) {
      console.error("데이터를 불러오는데 실패했습니다:", error);
      showToast("게임 정보를 불러오지 못했습니다.", "error");
    } finally {
      setLoading(false);
    }
  };

  // 전역 헤더를 숨기는 useEffect
  useEffect(() => {
    // 헤더 숨기기
    document.body.classList.add('hide-header');

    // 컴포넌트 언마운트 시 클래스 제거
    return () => {
      document.body.classList.remove('hide-header');
    };
  }, []);

  // 첫 방문 코치마크
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(COACHMARK_STORAGE_KEY)) {
      setShowCoachmark(true);
    }
  }, []);

  const dismissCoachmark = () => {
    localStorage.setItem(COACHMARK_STORAGE_KEY, "1");
    setShowCoachmark(false);
  };

  // 스타일 요소 추가
  useEffect(() => {
    // 스타일 태그 생성
    const styleTag = document.createElement('style');
    styleTag.innerHTML = `
      body.hide-header header {
        display: none !important;
      }
      body.hide-header {
        margin-top: 0 !important;
        padding-top: 0 !important;
      }
      body.hide-header main {
        padding-top: 0 !important;
        margin-top: 0 !important;
        height: 100vh !important;
      }
      .full-height {
        height: calc(100vh - 2rem) !important;
        display: flex;
        flex-direction: column;
      }
    `;

    // head에 스타일 태그 추가
    document.head.appendChild(styleTag);

    // 컴포넌트 언마운트 시 스타일 태그 제거
    return () => {
      if (styleTag.parentNode) {
        styleTag.parentNode.removeChild(styleTag);
      }
    };
  }, []);

  useEffect(() => {
    if (params.id) {
      fetchGameData();
    }
  }, [params.id]);
  // 로그에서 스코어 계산
  useEffect(() => {
    if (!game) return;

    let home = 0;
    let away = 0;
    const fouls: { [playerId: number]: number } = {};
    // 현재 쿼터의 팀별 파울 합산 (팀파울) — 쿼터가 바뀌면 0부터 다시 센다.
    // 단, 연장전은 4쿼터의 연장으로 간주해 4쿼터 팀파울을 이어서 센다 (FIBA 규칙).
    const currentQuarter = game.currentQuarter ?? 1;
    const foulBucket = (quarter: number) => (quarter >= 4 ? 4 : quarter);
    let homeTeamFouls = 0;
    let awayTeamFouls = 0;

    game.logs?.forEach(log => {
      const isHomePlayer = game.homePlayers.some(p => p.id === log.playerId);
      const logItem = logItems.find(item => item.id === log.logitemId);

      if (logItem) {
        if (isHomePlayer) {
          home += logItem.value;
        } else {
          away += logItem.value;
        }
      }
      if (logItem?.name === "파울") {
        fouls[log.playerId] = (fouls[log.playerId] || 0) + 1;
        // 구 로그(quarter null)는 1쿼터로 간주
        if (foulBucket(log.quarter ?? 1) === foulBucket(currentQuarter)) {
          if (isHomePlayer) {
            homeTeamFouls += 1;
          } else {
            awayTeamFouls += 1;
          }
        }
      }
    });

    setFoulCount(fouls);
    setTeamFouls({ home: homeTeamFouls, away: awayTeamFouls });

    setHomeScore(home);
    setAwayScore(away);
  }, [game, logItems]);

  const handlePlayerSelect = (playerId: number, team: 'home' | 'away') => {
    if (!canRecord) {
      showToast(
        user
          ? "소속 그룹의 경기만 기록할 수 있습니다."
          : "기록 입력은 로그인이 필요합니다.",
        "error"
      );
      return;
    }
    // 이미 선택된 선수를 다시 클릭하면 선택 해제
    if (selectedPlayer === playerId) {
      setSelectedPlayer(null);
      setSelectedTeam(null);
      setSelectedLogItem(null);
    } else {
      setSelectedPlayer(playerId);
      setSelectedTeam(team);
    }
  };

  const handleLogItemSelect = (logItemId: number) => {
    if (isRecording) return;
    setSelectedLogItem(selectedLogItem === logItemId ? null : logItemId);

    if (selectedLogItem !== logItemId) {
      // 선택한 LogItem이 변경되면 즉시 기록 저장
      handleRecordLog(logItemId);
    }
  };

  const handleRecordLog = async (logItemId: number) => {
    if (!selectedPlayer || !game) return;

    const logItem = logItems.find(item => item.id === logItemId);
    if (!logItem) return;

    setIsRecording(true);
    try {
      // 로그 저장
      const response = await api.post("/log", {
        gameId: game.id,
        playerId: selectedPlayer,
        logitemId: logItemId,
        groupId: game.groupId
      }, {
        headers: {
          Authorization: `Bearer ${user?.accessToken}`,
        },
      });

      // 전체 재조회 대신 응답으로 받은 로그를 로컬 상태에 즉시 반영해
      // 경기 중 기록 지연과 화면 깜빡임을 줄인다.
      const created = response.data;
      if (created && typeof created === "object" && "id" in created) {
        const newLog = {
          ...created,
          playerId: created.playerId ?? selectedPlayer,
          logitemId: created.logitemId ?? logItemId,
        } as Log;
        setGame(prev =>
          prev
            ? {
                ...prev,
                // 서버가 찍어준 쿼터가 로컬 표시와 다르면 서버 기준으로 보정
                currentQuarter:
                  typeof created.quarter === "number"
                    ? created.quarter
                    : prev.currentQuarter,
                logs: [...(prev.logs ?? []), newLog],
              }
            : prev,
        );
      } else {
        await fetchGameData();
      }

      // 기록 성공 후 선택 초기화
      setSelectedPlayer(null);
      setSelectedTeam(null);
      setSelectedLogItem(null);

    } catch (error) {
      console.error("기록 저장에 실패했습니다:", error);
      showToast("기록 저장에 실패했습니다. 다시 시도해주세요.", "error");
    } finally {
      setIsRecording(false);
    }
  };

  const handleCancel = () => {
    setSelectedPlayer(null);
    setSelectedTeam(null);
    setSelectedLogItem(null);
  };

  // 로그 데이터를 처리하는 함수
  const getProcessedLogs = () => {
    if (!game || !game.logs) return [];

    return [...game.logs]
      .map(log => {
        const player = [...game.homePlayers, ...game.awayPlayers].find(p => p.id === log.playerId);
        const logItem = logItems.find(item => item.id === log.logitemId);
        return {
          ...log,
          playerName: player?.name || '알 수 없음',
          actionName: logItem?.name || '알 수 없음',
          team: game.homePlayers.some(p => p.id === log.playerId) ? 'home' : 'away'
        };
      })
      .reverse(); // 최근 기록이 위에 오도록 역순 정렬
  };

  // 실행 취소
  const handleUndo = async () => {
    if (!game || !game.logs || game.logs.length === 0) return;
    if (!canRecord) {
      showToast(
        user
          ? "소속 그룹의 경기만 기록을 취소할 수 있습니다."
          : "기록 취소는 로그인이 필요합니다.",
        "error"
      );
      return;
    }

    // 토스트 안내용으로 마지막 로그 정보를 미리 확보
    const lastLog = game.logs[game.logs.length - 1];
    const lastPlayer = [...game.homePlayers, ...game.awayPlayers].find(p => p.id === lastLog.playerId);
    const lastLogItem = logItems.find(item => item.id === lastLog.logitemId);

    try {
      // 백엔드 API 호출하여 마지막 로그 삭제
      await api.delete(`/log/game/${game.id}/undo`, {
        headers: {
          Authorization: `Bearer ${user?.accessToken}`,
        },
      });

      // 게임 데이터 새로고침 (다른 기록자와의 동시 사용을 고려해 서버 기준으로 갱신)
      const response = await api.get<Game>(`/game/${game.id}`);
      setGame(response.data);

      showToast(
        `기록 취소: ${lastPlayer?.name ?? "알 수 없음"} ${lastLogItem?.name ?? ""}`.trim(),
        "info"
      );
    } catch (error) {
      console.error("로그 삭제에 실패했습니다:", error);
      showToast("기록 취소에 실패했습니다. 다시 시도해주세요.", "error");
    }
  };

  // 팀 스왑 함수
  const handleSwapTeams = () => {
    setIsTeamPositionSwapped(!isTeamPositionSwapped);
  };

  const handleQuarterChange = async (quarter: number) => {
    if (
      !game ||
      !canRecord ||
      game.status !== 'IN_PROGRESS' ||
      quarter === (game.currentQuarter ?? 1)
    )
      return;
    // 연속 탭으로 인한 쿼터 변경 요청 경합을 막기 위한 in-flight 가드
    if (isChangingQuarter) return;
    setIsChangingQuarter(true);
    try {
      await api.patch(`/game/${game.id}/quarter`, { quarter }, {
        headers: {
          Authorization: `Bearer ${user?.accessToken}`,
        },
      });
      setGame(prev => (prev ? { ...prev, currentQuarter: quarter } : prev));
    } catch (error) {
      console.error("쿼터 변경에 실패했습니다:", error);
      showToast("쿼터 변경에 실패했습니다. 다시 시도해주세요.", "error");
    } finally {
      setIsChangingQuarter(false);
    }
  };

  if (loading) return <div style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>로딩 중...</div>;
  if (!game) return <div style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>게임을 찾을 수 없습니다.</div>;

  // 현재 위치에 따른 팀 데이터
  const leftTeam = isTeamPositionSwapped ?
    { name: game.awayTeamName, players: game.awayPlayers, type: 'away' as const, score: awayScore } :
    { name: game.homeTeamName, players: game.homePlayers, type: 'home' as const, score: homeScore };

  const rightTeam = isTeamPositionSwapped ?
    { name: game.homeTeamName, players: game.homePlayers, type: 'home' as const, score: homeScore } :
    { name: game.awayTeamName, players: game.awayPlayers, type: 'away' as const, score: awayScore };

  return (
    <>
      {showCoachmark && (
        <CoachmarkOverlay onClick={dismissCoachmark}>
          <CoachmarkBox role="dialog" aria-modal="true" aria-label="기록 방법 안내" onClick={(e) => e.stopPropagation()}>
            <h3>🏀 경기 기록 방법</h3>
            <ol>
              <li><strong>선수 버튼</strong>을 누르면 기록 항목 목록으로 바뀝니다.</li>
              <li><strong>기록 항목</strong>(2점, 어시, 리바 등)을 누르면 즉시 저장됩니다.</li>
              <li>잘못 입력했다면 가운데 <strong>↩ 되돌리기</strong> 버튼으로 취소하세요.</li>
              <li>기록 입력은 <strong>로그인</strong>이 필요합니다.</li>
            </ol>
            <button onClick={dismissCoachmark}>시작하기</button>
          </CoachmarkBox>
        </CoachmarkOverlay>
      )}
      <Container className="full-height">
      {/* 아이콘만 남으므로 스크린리더용 이름을 aria-label로 따로 준다 */}
      <BackButton onClick={() => router.back()} aria-label="뒤로 가기">
        {'<'}
      </BackButton>
      <GameInfoHeader>
        <GameName>{`${game.homeTeamName} vs ${game.awayTeamName}`}</GameName>
        {!canRecord && (
          <ViewOnlyNotice>
            {user
              ? "조회 전용 — 소속 그룹의 경기만 기록할 수 있습니다"
              : "조회 전용 — 기록 입력은 로그인이 필요합니다"}
          </ViewOnlyNotice>
        )}
        <ScoreDisplay>
          <span className="score">{leftTeam.score}</span>
          <span className="vs">vs</span>
          <span className="score">{rightTeam.score}</span>
        </ScoreDisplay>
        {(() => {
          const currentQuarter = game.currentQuarter ?? 1;
          // 연장 쿼터에 로그가 하나라도 있으면, 다른 쿼터로 이동해도
          // 해당 연장 칩이 사라지지 않도록 로그의 최대 쿼터까지 표시한다.
          const maxLoggedQuarter = (game.logs ?? []).reduce(
            (max, log) => Math.max(max, log.quarter ?? 1),
            1,
          );
          const chips = Array.from(
            { length: Math.max(4, currentQuarter, maxLoggedQuarter) },
            (_, i) => i + 1,
          );
          const quarterLocked = !canRecord || game.status !== 'IN_PROGRESS' || isChangingQuarter;
          return (
            <QuarterBar>
              {chips.map(q => (
                <QuarterChip
                  key={q}
                  isActive={q === currentQuarter}
                  disabled={quarterLocked}
                  onClick={() => handleQuarterChange(q)}
                >
                  {formatQuarter(q)}
                </QuarterChip>
              ))}
              {currentQuarter >= 4 && currentQuarter < 10 && (
                <QuarterChip
                  isActive={false}
                  disabled={quarterLocked}
                  onClick={() => handleQuarterChange(currentQuarter + 1)}
                >
                  +연장
                </QuarterChip>
              )}
            </QuarterBar>
          );
        })()}
        <SwapButton onClick={handleSwapTeams}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
          팀 위치 바꾸기
        </SwapButton>
      </GameInfoHeader>



      <TeamsContainer>
        {/* 왼쪽 팀 영역 */}
        <TeamSection>
          <TeamHeader className="team-header">
            {selectedTeam !== leftTeam.type ? (
              <>
                <h3>{`${leftTeam.type === 'home' ? '홈팀' : '어웨이팀'} (${leftTeam.name})`}</h3>
                <TeamFoulBadge title="현재 쿼터 팀파울 (연장은 4쿼터에 합산)">
                  팀파울 {teamFouls[leftTeam.type]}
                </TeamFoulBadge>
              </>
            ) : (
              <CancelButton onClick={handleCancel}>취소</CancelButton>
            )}
          </TeamHeader>
          {selectedTeam !== leftTeam.type ? (
            <PlayerList className="player-list">
              {leftTeam.players.map((player) => (
                <PlayerButton
                  key={player.id}
                  isSelected={selectedPlayer === player.id}
                  onClick={() => handlePlayerSelect(player.id, leftTeam.type)}
                >
                  {player.name}
                  {(foulCount[player.id] ?? 0) > 0 && (
                    <PlayerBadge title="파울 수">{foulCount[player.id]}</PlayerBadge>
                  )}
                </PlayerButton>
              ))}
            </PlayerList>
          ) : (
            <LogItemsContainer className="log-items">
              {logItems.map((item) => (
                <LogItemButton
                  key={item.id}
                  isSelected={selectedLogItem === item.id}
                  hasValue={item.value !== 0}
                  isNegative={["파울", "턴오버"].includes(item.name)}
                  onClick={() => handleLogItemSelect(item.id)}
                >
                  {item.name}
                </LogItemButton>
              ))}
            </LogItemsContainer>
          )}
        </TeamSection>

        {/* 로그 히스토리 컴포넌트 - 가운데 배치 */}

        <LogHistoryContainer>
          <HistoryButtonContainer>
          <HistoryButton
            onClick={handleUndo}
            disabled={!game?.logs || game.logs.length === 0}
            title="마지막 기록 취소"
            aria-label="마지막 기록 취소"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
            </svg>
            되돌리기
          </HistoryButton>
          </HistoryButtonContainer>
            {getProcessedLogs().map((log, index) => (
              <LogHistoryItem key={log.id || index}>
                <LogHistoryPlayerName style={{
                  color: log.team === 'home' ? 'var(--primary-color)' : '#ef4444'
                }}>
                  {log.playerName}
                </LogHistoryPlayerName>
                <LogHistoryActionName>{log.actionName}</LogHistoryActionName>
                <LogQuarterLabel>{formatQuarter(log.quarter)}</LogQuarterLabel>
              </LogHistoryItem>
            ))}
            {getProcessedLogs().length === 0 && (
              <LogHistoryItem>기록된 로그가 없습니다.</LogHistoryItem>
            )}
        </LogHistoryContainer>

        {/* 오른쪽 팀 영역 */}
        <TeamSection>
          <TeamHeader className="team-header">
            {selectedTeam !== rightTeam.type ? (
              <>
                <h3>{`${rightTeam.type === 'home' ? '홈팀' : '어웨이팀'} (${rightTeam.name})`}</h3>
                <TeamFoulBadge title="현재 쿼터 팀파울 (연장은 4쿼터에 합산)">
                  팀파울 {teamFouls[rightTeam.type]}
                </TeamFoulBadge>
              </>
            ) : (
              <CancelButton onClick={handleCancel}>취소</CancelButton>
            )}
          </TeamHeader>
          {selectedTeam !== rightTeam.type ? (
            <PlayerList className="player-list">
              {rightTeam.players.map((player) => (
                <PlayerButton
                  key={player.id}
                  isSelected={selectedPlayer === player.id}
                  onClick={() => handlePlayerSelect(player.id, rightTeam.type)}
                >
                  {player.name}
                  {(foulCount[player.id] ?? 0) > 0 && (
                    <PlayerBadge title="파울 수">{foulCount[player.id]}</PlayerBadge>
                  )}
                </PlayerButton>
              ))}
            </PlayerList>
          ) : (
            <LogItemsContainer className="log-items">
              {logItems.map((item) => (
                <LogItemButton
                  key={item.id}
                  isSelected={selectedLogItem === item.id}
                  hasValue={item.value !== 0}
                  isNegative={["파울", "턴오버"].includes(item.name)}
                  onClick={() => handleLogItemSelect(item.id)}
                >
                  {item.name}
                </LogItemButton>
              ))}
            </LogItemsContainer>
          )}
        </TeamSection>
      </TeamsContainer>
    </Container>
    </>
  );
}
