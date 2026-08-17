// RankingsRepository가 돌려주는 (선수 x 기록항목) 집계 한 줄
export interface RankingAggRow {
  playerId: number;
  playerName: string;
  backnumber: string | null;
  logitemId: number;
  logitemName: string;
  logitemValue: number;
  count: number;
  valueSum: number;
}

export interface RankingGamesPlayed {
  playerId: number;
  gamesPlayed: number;
}

export interface RankingPlayer {
  playerId: number;
  playerName: string;
  number: string | null;
  totalCount: number;
  avgPerGame: number;
  gamesPlayed: number;
  // 득점 종합 항목에서만 채워진다 (프론트 정렬이 이 필드를 쓴다)
  totalScore?: number;
  avgScore?: number;
}

export interface RankingItem {
  id: number; // logitem id. 득점 종합은 -1
  name: string;
  value: number;
  players: RankingPlayer[];
}

export interface RankingsResponse {
  rankings: RankingItem[];
}
