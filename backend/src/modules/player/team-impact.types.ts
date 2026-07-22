// 리포지토리 → util 입력 로우 타입
export interface GameRow {
  gameId: number;
  team: 'home' | 'away';
  date: string;
}
export interface TeamAggRow {
  gameId: number;
  team: string;
  name: string;
  count: number;
  valueSum: number;
}
export interface SelfAggRow {
  gameId: number;
  name: string;
  count: number;
  valueSum: number;
}
export interface RosterRow {
  gameId: number;
  team: string;
  playerId: number;
  name: string;
}

// API 응답 타입
export interface TeammateChemistry {
  playerId: number;
  name: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
}
export interface ContributionShare {
  key: 'scoring' | 'assist' | 'rebound' | 'defense';
  label: string;
  share: number | null;
  present: boolean;
}
export interface PlayerTeamImpact {
  playerId: number;
  groupId: number;
  finishedGames: number;
  hasData: boolean;
  record: { wins: number; draws: number; losses: number };
  winRate: number | null;
  recentForm: ('W' | 'D' | 'L')[];
  streak: { current: number; currentType: 'W' | 'D' | 'L' | null; best: number };
  avgTeamScore: number;
  avgOpponentScore: number;
  avgMargin: number;
  clutch: {
    games: number;
    wins: number;
    draws: number;
    losses: number;
    winRate: number | null;
  };
  contributions: ContributionShare[];
  ability: {
    effPerGame: number;
    astToRatio: number | null;
    astCount: number;
    toCount: number;
  };
  impact: { avgPointsInWins: number | null; avgPointsInLosses: number | null };
  bestTeammates: TeammateChemistry[];
}
