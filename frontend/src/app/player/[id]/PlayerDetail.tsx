"use client";

import { useEffect, useState } from "react";
import { LogItem } from "@/types/game";
import { api } from "@/lib/axios";
import { GameRecord, GroupPlayer, PlayerAbility } from "./types";
import PlayerDetailClient from "./PlayerDetailClient";

interface PlayerLog {
  id: number;
  gameId: number;
  playerId: number;
  logitemId: number;
  logitem: LogItem;
  game: {
    id: number;
    name: string;
    date: string;
  };
}

interface PlayerDetailProps {
  params: {
    id: string;
  };
}

export default function PlayerDetail({ params }: PlayerDetailProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [player, setPlayer] = useState<any>(null);
  const [gameRecords, setGameRecords] = useState<GameRecord[]>([]);
  const [allLogItemNames, setAllLogItemNames] = useState<string[]>([]);
  const [ability, setAbility] = useState<PlayerAbility | null>(null);
  const [groupPlayers, setGroupPlayers] = useState<GroupPlayer[]>([]);

  const playerId = params.id;

  useEffect(() => {
    const fetchPlayerData = async () => {
      try {
        setLoading(true);
        setError(null);

        // 선수 정보를 먼저 받아 그룹 컨텍스트를 확보한다.
        // (/logitem은 groupId 쿼리가 필수 — 없으면 서버가 500)
        const playerResponse = await api.get(`/player/${playerId}`);
        const playerData = playerResponse.data;

        // 같은 그룹 선수 목록(선수 전환 콤보박스용)은 독립 처리 —
        // 실패해도 페이지 나머지 렌더에 영향 없이 콤보박스만 숨긴다.
        api
          .get(`/player?groupId=${playerData.groupId}`)
          .then((res) => setGroupPlayers(res.data))
          .catch((e) => {
            console.error("Error fetching group players:", e);
            setGroupPlayers([]);
          });

        // 나머지는 병렬로. logitem은 선수의 그룹으로 필터링한다.
        const [logsResponse, logItemsResponse, totalGamesPlayed] = await Promise.all([
          api.get(`/log/player/${playerId}`),
          api.get(`/logitem?groupId=${playerData.groupId}`),
          api.get(`/player/total-games-played/${playerId}`)
        ]);
        const allLogItems = logItemsResponse.data;

        // 게임별로 로그 그룹화
        const logsByGame = new Map<number, PlayerLog[]>();
        logsResponse.data.forEach((log: PlayerLog) => {
          const gameId = log.gameId;
          if (!logsByGame.has(gameId)) {
            logsByGame.set(gameId, []);
          }
          logsByGame.get(gameId)?.push(log);
        });

        // 게임별 기록 생성
        const records: GameRecord[] = [];

        logsByGame.forEach((logs, gameId) => {
          if (logs.length === 0) return;

          const gameInfo = logs[0].game;
          const logSummary = new Map<string, { count: number; value: number }>();

          logs.forEach((log) => {
            const key = log.logitem.name;
            const existing = logSummary.get(key);
            if (existing) {
              existing.count += 1;
            } else {
              logSummary.set(key, {
                count: 1,
                value: log.logitem.value,
              });
            }
          });

          const totalScore = logs.reduce((sum, log) => sum + log.logitem.value, 0);

          records.push({
            gameId: gameInfo.id,
            gameName: gameInfo.name,
            gameDate: gameInfo.date,
            logs: Array.from(logSummary.entries()).map(([name, stats]) => ({
              name,
              count: stats.count,
              value: stats.value,
            })),
            totalScore,
          });
        });

        // 날짜 순으로 정렬
        const sortedRecords = records.sort((a: GameRecord, b: GameRecord) => 
          new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime()
        );

        // 모든 로그 아이템 이름 목록 추출
        const logItemNames = allLogItems.map((item: LogItem) => item.name);

        setPlayer(playerData);
        setGameRecords(sortedRecords);
        setAllLogItemNames(logItemNames);

        // 능력치는 실패해도 나머지 렌더에 영향 없도록 독립 처리
        api
          .get(`/player/${playerId}/ability`)
          .then((res) => setAbility(res.data))
          .catch((e) => {
            console.error("Error fetching ability:", e);
            setAbility(null);
          });
      } catch (error) {
        console.error("Error fetching player data:", error);
        setError("데이터를 불러오는데 실패했습니다");
      } finally {
        setLoading(false);
      }
    };

    fetchPlayerData();
  }, [playerId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">데이터를 불러오는 중...</h2>
        </div>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">데이터를 불러오는데 실패했습니다</h2>
          <p className="text-gray-600">잠시 후 다시 시도해주세요.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <PlayerDetailClient
        player={player}
        gameRecords={gameRecords}
        allLogItemNames={allLogItemNames}
        ability={ability}
        groupPlayers={groupPlayers}
      />
    </div>
  );
} 