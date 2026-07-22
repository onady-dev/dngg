// 게임 기록 인터페이스
export interface GameRecord {
  gameId: number;
  gameName: string;
  gameDate: string;
  logs: {
    name: string;
    count: number;
    value: number;
  }[];
  totalScore: number;
}

export interface Player {
  id: number;
  name: string;
  position: string;
  backnumber: string;
}

// 그룹 선수 목록(선수 전환 콤보박스용). backnumber/position은 표시에만 사용.
export interface GroupPlayer {
  id: number;
  name: string;
  backnumber?: string | number | null;
  position?: string | null;
}

export interface AbilityAxis {
  key: string;
  label: string;
  score: number | null;
  rawPerGame: number;
  groupAvgPerGame: number;
  higherIsBetter: boolean;
}

export interface PlayerAbility {
  playerId: number;
  groupId: number;
  mode: "basketball" | "dynamic";
  gamesPlayed: number;
  groupSize: number;
  hasData: boolean;
  axes: AbilityAxis[];
}

export type GameResultLetter = "W" | "D" | "L";

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
  key: "scoring" | "assist" | "rebound" | "defense";
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
  recentForm: GameResultLetter[];
  streak: { current: number; currentType: GameResultLetter | null; best: number };
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
