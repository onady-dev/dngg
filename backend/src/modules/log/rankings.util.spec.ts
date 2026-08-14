import { computeRankings } from './rankings.util';
import { RankingAggRow } from './rankings.types';

const row = (over: Partial<RankingAggRow>): RankingAggRow => ({
  playerId: 1,
  playerName: '선수1',
  backnumber: '7',
  logitemId: 1,
  logitemName: '3점',
  logitemValue: 3,
  count: 2,
  valueSum: 6,
  ...over,
});

describe('computeRankings', () => {
  test('기록 항목별로 선수 집계를 만든다', () => {
    const result = computeRankings({
      rows: [
        row({}),
        row({ playerId: 2, playerName: '선수2', count: 1, valueSum: 3 }),
      ],
      gamesPlayed: [
        { playerId: 1, gamesPlayed: 2 },
        { playerId: 2, gamesPlayed: 1 },
      ],
    });

    const threePoint = result.rankings.find((r) => r.name === '3점');
    expect(threePoint).toBeDefined();
    expect(threePoint!.id).toBe(1);
    expect(threePoint!.value).toBe(3);
    expect(threePoint!.players).toHaveLength(2);

    const p1 = threePoint!.players.find((p) => p.playerId === 1)!;
    expect(p1.totalCount).toBe(2);
    expect(p1.gamesPlayed).toBe(2);
    expect(p1.avgPerGame).toBe(1);
    expect(p1.number).toBe('7');
  });

  test('출전 경기가 0이면 평균은 0이다 (0으로 나누지 않는다)', () => {
    const result = computeRankings({
      rows: [row({})],
      gamesPlayed: [],
    });

    const threePoint = result.rankings.find((r) => r.name === '3점')!;
    expect(threePoint.players[0].gamesPlayed).toBe(0);
    expect(threePoint.players[0].avgPerGame).toBe(0);
  });

  test("이름에 '자유투'가 든 항목은 랭킹 목록에서 숨긴다", () => {
    const result = computeRankings({
      rows: [
        row({}),
        row({
          logitemId: 5,
          logitemName: '자유투1점',
          logitemValue: 1,
          count: 4,
          valueSum: 4,
        }),
      ],
      gamesPlayed: [{ playerId: 1, gamesPlayed: 2 }],
    });

    expect(result.rankings.some((r) => r.name.includes('자유투'))).toBe(false);
  });

  test('득점 종합은 자유투를 포함한 전체 valueSum으로 계산한다', () => {
    const result = computeRankings({
      rows: [
        row({}), // 3점 x2 = 6점
        row({
          logitemId: 5,
          logitemName: '자유투1점',
          logitemValue: 1,
          count: 4,
          valueSum: 4,
        }),
        row({
          logitemId: 6,
          logitemName: '자유투2점',
          logitemValue: 2,
          count: 1,
          valueSum: 2,
        }),
      ],
      gamesPlayed: [{ playerId: 1, gamesPlayed: 2 }],
    });

    const scoring = result.rankings.find((r) => r.name === '득점')!;
    expect(scoring.id).toBe(-1);
    const p1 = scoring.players[0];
    expect(p1.totalScore).toBe(12); // 6 + 4 + 2
    expect(p1.totalCount).toBe(12); // 화면은 totalCount를 표시한다
    expect(p1.avgScore).toBe(6);
    expect(p1.avgPerGame).toBe(6);
  });

  test('득점 종합을 목록 맨 앞에 넣는다', () => {
    const result = computeRankings({
      rows: [row({})],
      gamesPlayed: [{ playerId: 1, gamesPlayed: 2 }],
    });

    expect(result.rankings[0].name).toBe('득점');
  });

  test('아무도 득점이 없으면 득점 종합 항목을 넣지 않는다', () => {
    const result = computeRankings({
      rows: [
        row({
          logitemId: 2,
          logitemName: '리바',
          logitemValue: 0,
          count: 5,
          valueSum: 0,
        }),
      ],
      gamesPlayed: [{ playerId: 1, gamesPlayed: 2 }],
    });

    expect(result.rankings.some((r) => r.name === '득점')).toBe(false);
    expect(result.rankings).toHaveLength(1);
  });

  test('로그가 없으면 빈 목록을 반환한다', () => {
    const result = computeRankings({ rows: [], gamesPlayed: [] });

    expect(result.rankings).toEqual([]);
  });
});
