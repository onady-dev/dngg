import { api } from "@/lib/axios";
import type { Team } from "@/types/player";

// 팀 구성 서버 API 클라이언트.
// 쓰기 요청의 토큰은 axios 인터셉터가 아니라 호출부의 user.accessToken을 명시적으로 받는다
// (기존 player/game 쓰기 요청과 동일한 패턴).

const authHeader = (token: string) => ({
  headers: { Authorization: `Bearer ${token}` },
});

export async function fetchTeams(groupId: number): Promise<Team[]> {
  const response = await api.get("/team", { params: { groupId } });
  return response.data;
}

export async function createTeam(
  groupId: number,
  name: string,
  token: string,
  playerIds: number[] = []
): Promise<Team> {
  const response = await api.post("/team", { groupId, name, playerIds }, authHeader(token));
  return response.data;
}

export async function updateTeamPlayers(
  teamId: number,
  groupId: number,
  playerIds: number[],
  token: string
): Promise<Team> {
  const response = await api.put(`/team/${teamId}`, { groupId, playerIds }, authHeader(token));
  return response.data;
}

export async function renameTeam(
  teamId: number,
  groupId: number,
  name: string,
  token: string
): Promise<Team> {
  const response = await api.put(`/team/${teamId}`, { groupId, name }, authHeader(token));
  return response.data;
}

export async function deleteTeam(teamId: number, groupId: number, token: string): Promise<void> {
  await api.delete(`/team/${teamId}`, { params: { groupId }, ...authHeader(token) });
}

export async function resetTeams(groupId: number, token: string): Promise<void> {
  await api.delete("/team", { params: { groupId }, ...authHeader(token) });
}

export async function bulkUploadTeams(
  groupId: number,
  teams: { name: string; playerIds: number[] }[],
  token: string
): Promise<Team[]> {
  const response = await api.post("/team/bulk", { groupId, teams }, authHeader(token));
  return response.data;
}
