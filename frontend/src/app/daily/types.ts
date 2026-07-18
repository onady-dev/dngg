export interface LogItemDef {
  id: number;
  name: string;
  value: number;
}

export interface PlayerRecord {
  id: number;
  name: string;
  backnumber: number;
  totalScore: number;
  logItem: {
    [id: number]: { id: number; name: string; value: number; count: number };
  };
}

export interface GameSummary {
  id: number;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeScore: number;
  awayScore: number;
  status: string;
}
