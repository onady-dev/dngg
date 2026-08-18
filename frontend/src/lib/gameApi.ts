import { api } from "@/lib/axios";
import type { Game } from "@/types/game";

export interface AssignSeasonResult {
  updated: number;
}

// seasonId가 null이면 시즌 미지정으로 되돌린다.
export const assignGameSeason = async (
  groupId: number,
  gameIds: number[],
  seasonId: number | null
): Promise<AssignSeasonResult> => {
  const response = await api.put("/game/season", { groupId, gameIds, seasonId });
  return response.data;
};

// 날짜 범위 안의 완료 경기를 페이징 없이 전부 가져온다(선택 모드 전용).
export const fetchFinishedGamesInRange = async (
  groupId: number,
  from: string,
  to: string
): Promise<Game[]> => {
  const response = await api.get("/game", {
    params: { groupId, status: "FINISHED", from, to },
  });
  const data = response.data;
  return Array.isArray(data) ? data : (data.games ?? []);
};
