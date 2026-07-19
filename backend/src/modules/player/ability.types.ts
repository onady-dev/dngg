export interface AbilityRow {
  playerId: number;
  name: string;
  count: number;
  valueSum: number;
}

export interface GamesPlayed {
  playerId: number;
  gamesPlayed: number;
}

export interface AbilityAxis {
  key: string;
  label: string;
  score: number | null; // 0~100 백분위. 모집단<=1이면 null
  rawPerGame: number;
  groupAvgPerGame: number;
  higherIsBetter: boolean;
}

export interface PlayerAbility {
  playerId: number;
  groupId: number;
  mode: 'basketball' | 'dynamic';
  gamesPlayed: number;
  groupSize: number;
  hasData: boolean;
  axes: AbilityAxis[];
}
