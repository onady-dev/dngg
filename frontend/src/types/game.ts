import { Player } from "./player";

export interface Game {
  id: number;
  homeTeamName: string;
  awayTeamName: string;
  date: string;
  groupId: number;
  status: 'READY' | 'IN_PROGRESS' | 'FINISHED';
  homePlayers: Player[];
  awayPlayers: Player[];
  logs: Log[];
  seasonId?: number | null; // 시즌 미지정이면 null, 구버전 백엔드면 undefined
  currentQuarter?: number; // 백엔드 미배포 시 undefined → 1로 간주
}

export interface LogItem {
  id: number;
  // groupId: number;
  name: string;
  value: number;
}

export interface Log {
  id: number;
  groupId: number;
  gameId: number;
  playerId: number;
  logitemId: number;
  game: Game;
  logitem: LogItem;
  player: Player;
  quarter?: number | null; // 구 로그는 null → 1쿼터로 간주
}

export interface Group {
  id: number;
  name: string;
}
