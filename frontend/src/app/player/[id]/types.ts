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
