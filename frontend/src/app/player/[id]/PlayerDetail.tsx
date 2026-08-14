"use client";

import { useEffect, useState } from "react";
import { LogItem } from "@/types/game";
import { api } from "@/lib/axios";
import { GameRecord, GroupPlayer, PlayerAbility, PlayerTeamImpact } from "./types";
import PlayerDetailClient from "./PlayerDetailClient";
import SeasonSelector from "@/app/components/SeasonSelector";
import {
  useSeasonStore,
  resolveSeasonSelection,
  seasonQuery,
  SeasonSelection,
} from "@/app/stores/seasonStore";
import { fetchSeasons, Season } from "@/lib/seasonApi";
import { useAuthStore } from "@/app/stores/useAuthStore";

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

// 시즌 선택에 따라 쿼리스트링을 조립한다.
// seasonQuery('all')은 ""을 반환하므로, 그 경우 물음표조차 붙이지 않는다.
// (`?${query}` 형태로 무조건 붙이면 "all" 선택 시 URL이 `...?`로 끝나는데,
// 서버 쿼리 파서 입장에서는 빈 쿼리스트링과 동일해 안전하지만 굳이 애매한
// 형태를 남길 이유가 없어 조건부로 붙인다.)
const withSeasonQuery = (path: string, selection: SeasonSelection): string => {
  const query = seasonQuery(selection); // "" 또는 "&seasonId=42"
  if (!query) return path;
  return `${path}?${query.replace(/^&/, "")}`;
};

export default function PlayerDetail({ params }: PlayerDetailProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [player, setPlayer] = useState<any>(null);
  const [gameRecords, setGameRecords] = useState<GameRecord[]>([]);
  const [allLogItemNames, setAllLogItemNames] = useState<string[]>([]);
  const [ability, setAbility] = useState<PlayerAbility | null>(null);
  const [teamImpact, setTeamImpact] = useState<PlayerTeamImpact | null>(null);
  const [groupPlayers, setGroupPlayers] = useState<GroupPlayer[]>([]);

  const [seasons, setSeasons] = useState<Season[]>([]);
  const [currentSeasonId, setCurrentSeasonId] = useState<number | null>(null);
  const [selection, setSelection] = useState<SeasonSelection>("all");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [seasonsReady, setSeasonsReady] = useState(false);
  const { selectionByGroup, setSelection: persistSelection } = useSeasonStore();
  const user = useAuthStore((state) => state.user);
  const canManage = !!user && groupId !== null && user.groupId === groupId;

  const playerId = params.id;

  // 1단계: 선수 정보 → 그룹 확보 → 시즌 목록 로드 → 선택 해석
  useEffect(() => {
    const loadPlayerAndSeasons = async () => {
      try {
        setLoading(true);
        setError(null);

        // 선수 정보를 먼저 받아 그룹 컨텍스트를 확보한다.
        // (/logitem은 groupId 쿼리가 필수 — 없으면 서버가 500)
        const playerResponse = await api.get(`/player/${playerId}`);
        const playerData = playerResponse.data;
        setPlayer(playerData);
        setGroupId(playerData.groupId);

        // 같은 그룹 선수 목록(선수 전환 콤보박스용)은 독립 처리 —
        // 실패해도 페이지 나머지 렌더에 영향 없이 콤보박스만 숨긴다.
        api
          .get(`/player?groupId=${playerData.groupId}`)
          .then((res) => setGroupPlayers(res.data))
          .catch((e) => {
            console.error("Error fetching group players:", e);
            setGroupPlayers([]);
          });

        try {
          const seasonData = await fetchSeasons(playerData.groupId);
          setSeasons(seasonData.seasons);
          setCurrentSeasonId(seasonData.currentSeasonId);
          setSelection(
            resolveSeasonSelection(
              selectionByGroup[playerData.groupId],
              seasonData.seasons,
              seasonData.currentSeasonId
            )
          );
        } catch (e) {
          // 시즌 조회 실패는 전체 기간으로 폴백한다.
          console.error("시즌 목록을 불러오지 못했습니다:", e);
          setSeasons([]);
          setCurrentSeasonId(null);
          setSelection("all");
        }
        setSeasonsReady(true);
      } catch (error) {
        console.error("Error fetching player data:", error);
        setError("데이터를 불러오는데 실패했습니다");
        setLoading(false);
      }
    };

    loadPlayerAndSeasons();
  }, [playerId]);

  // 2단계: 선택된 시즌으로 기록·능력치·팀 기여도를 조회한다.
  useEffect(() => {
    if (!seasonsReady || groupId === null) return;

    const fetchSeasonScopedData = async () => {
      try {
        setLoading(true);

        const [logsResponse, logItemsResponse] = await Promise.all([
          api.get(withSeasonQuery(`/log/player/${playerId}`, selection)),
          api.get(`/logitem?groupId=${groupId}`),
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

        logsByGame.forEach((logs) => {
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
        const sortedRecords = records.sort(
          (a: GameRecord, b: GameRecord) =>
            new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime()
        );

        setGameRecords(sortedRecords);
        setAllLogItemNames(allLogItems.map((item: LogItem) => item.name));

        // 능력치는 실패해도 나머지 렌더에 영향 없도록 독립 처리
        api
          .get(withSeasonQuery(`/player/${playerId}/ability`, selection))
          .then((res) => setAbility(res.data))
          .catch((e) => {
            console.error("Error fetching ability:", e);
            setAbility(null);
          });

        // 팀 기여도도 실패해도 나머지 렌더에 영향 없도록 독립 처리
        api
          .get(withSeasonQuery(`/player/${playerId}/team-impact`, selection))
          .then((res) => setTeamImpact(res.data))
          .catch((e) => {
            console.error("Error fetching team impact:", e);
            setTeamImpact(null);
          });
      } catch (error) {
        console.error("Error fetching season scoped data:", error);
        setError("데이터를 불러오는데 실패했습니다");
      } finally {
        setLoading(false);
      }
    };

    fetchSeasonScopedData();
  }, [playerId, groupId, selection, seasonsReady]);

  const handleSeasonChange = (next: SeasonSelection) => {
    setSelection(next);
    if (groupId !== null) persistSelection(groupId, next);
  };

  // 로딩·에러·본문을 조기 반환으로 나누면 시즌 선택기까지 함께 가려진다
  // (2단계 useEffect가 setLoading(true)를 부를 때마다 방금 조작한 선택기가
  // 사라졌다 나타나고, 조회 실패 시엔 선택기가 없어 다른 시즌으로 되돌릴
  // 방법이 없다). 선택기는 항상 렌더하고, 그 아래 본문만 배타적으로 분기한다.
  // (rankings/page.tsx와 동일한 구조 — 커밋 bae7423 참고)
  return (
    <div className="min-h-screen bg-white">
      {groupId !== null && (
        <div style={{ padding: "16px 16px 0" }}>
          <SeasonSelector
            groupId={groupId}
            seasons={seasons}
            currentSeasonId={currentSeasonId}
            selection={selection}
            canManage={canManage}
            onChange={handleSeasonChange}
            onSeasonsChanged={async () => {
              const data = await fetchSeasons(groupId);
              setSeasons(data.seasons);
              setCurrentSeasonId(data.currentSeasonId);
            }}
          />
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center" style={{ minHeight: "50vh" }}>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">데이터를 불러오는 중...</h2>
          </div>
        </div>
      )}

      {!loading && (error || !player) && (
        <div className="flex items-center justify-center" style={{ minHeight: "50vh" }}>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">데이터를 불러오는데 실패했습니다</h2>
            <p className="text-gray-600">잠시 후 다시 시도해주세요.</p>
          </div>
        </div>
      )}

      {!loading && !error && player && (
        <PlayerDetailClient
          player={player}
          gameRecords={gameRecords}
          allLogItemNames={allLogItemNames}
          ability={ability}
          teamImpact={teamImpact}
          groupPlayers={groupPlayers}
        />
      )}
    </div>
  );
}
