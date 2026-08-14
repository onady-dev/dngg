import { api } from "@/lib/axios";

export interface Season {
  id: number;
  name: string;
  createdAt: string;
}

export interface SeasonsResponse {
  seasons: Season[];
  currentSeasonId: number | null;
}

export const fetchSeasons = async (groupId: number): Promise<SeasonsResponse> => {
  const response = await api.get(`/season?groupId=${groupId}`);
  return response.data;
};

export const createSeason = async (groupId: number, name: string): Promise<Season> => {
  const response = await api.post("/season", { groupId, name });
  return response.data;
};

export const renameSeason = async (
  id: number,
  groupId: number,
  name: string
): Promise<Season> => {
  const response = await api.put(`/season/${id}`, { groupId, name });
  return response.data;
};

export const deleteSeason = async (id: number): Promise<{ affectedGames: number }> => {
  const response = await api.delete(`/season/${id}`);
  return response.data;
};

export const setCurrentSeason = async (
  groupId: number,
  seasonId: number | null
): Promise<{ currentSeasonId: number | null }> => {
  const response = await api.put("/season/current", { groupId, seasonId });
  return response.data;
};
