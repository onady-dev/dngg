export interface Player {
  id: number;
  name: string;
  backnumber: string;  // 등번호
  groupId: number;
  teamId?: string;
  position?: string;
  image?: string;
}

export interface Team {
  id: number;
  name: string;
  groupId?: number;
  players: Player[];
}

export interface PlayerRanking {
  playerId: string;
  playerName: string;
  number: string;
  value: number;
  totalCount?: number;
  avgPerGame?: number;
  totalScore?: number;
  avgScore?: number;
  gamesPlayed?: number;
}

export interface InGamePlayer {
  id: number;
  name: string;
  position: string;
  backnumber: string;
}