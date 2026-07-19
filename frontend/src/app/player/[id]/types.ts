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
