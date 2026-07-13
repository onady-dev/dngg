"use client";

import { useEffect, useState } from "react";
import { LogItem } from "@/types/game";
import { api } from "@/lib/axios";
import { GameRecord } from "./types";
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

  const playerId = params.id;

  useEffect(() => {
    const fetchPlayerData = async () => {
      try {
        setLoading(true);
        setError(null);

        // 로그 아이템, 선수 정보, 선수 로그를 동시에 가져옵니다
        const [playerResponse, logsResponse, logItemsResponse, totalGamesPlayed] = await Promise.all([
          api.get(`/player/${playerId}`),
          api.get(`/log/player/${playerId}`),
          api.get("/logitem"),
          api.get(`/player/total-games-played/${playerId}`)
        ]);
        const playerData = playerResponse.data;
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
      />
    </div>
  );
} 