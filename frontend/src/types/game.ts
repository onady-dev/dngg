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
}

export interface Group {
  id: number;
  name: string;
}
