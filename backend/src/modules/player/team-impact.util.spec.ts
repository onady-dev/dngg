import { buildGameResults, computeStreak, computeClutch } from './team-impact.util';
import { GameRow, TeamAggRow, SelfAggRow } from './team-impact.types';

describe('buildGameResults', () => {
  const games: GameRow[] = [
    { gameId: 2, team: 'home', date: '2026-07-10' },
    { gameId: 1, team: 'away', date: '2026-07-08' },
  ];
  // game1: home=10, away(=내팀)=12 → 승. game2: home(=내팀)=8, away=8 → 무
  const teamAgg: TeamAggRow[] = [
    { gameId: 1, team: 'home', name: '2점', count: 5, valueSum: 10 },
    { gameId: 1, team: 'away', name: '2점', count: 6, valueSum: 12 },
    { gameId: 2, team: 'home', name: '2점', count: 4, valueSum: 8 },
    { gameId: 2, team: 'away', name: '2점', count: 4, valueSum: 8 },
  ];
  const selfAgg: SelfAggRow[] = [
    { gameId: 1, name: '2점', count: 2, valueSum: 4 },
    { gameId: 2, name: '3점', count: 1, valueSum: 3 },
  ];

  it('날짜 오름차순 정렬 + 내/상대 점수·승무패·본인득점 파생', () => {
    const results = buildGameResults(games, teamAgg, selfAgg);
    expect(results.map((r) => r.gameId)).toEqual([1, 2]); // 07-08 먼저
    expect(results[0]).toMatchObject({ myScore: 12, oppScore: 10, result: 'W', myPoints: 4 });
    expect(results[1]).toMatchObject({ myScore: 8, oppScore: 8, result: 'D', myPoints: 3 });
  });
});

describe('computeStreak', () => {
  it('최다 연승과 현재 연속(최신 기준)을 계산', () => {
    const mk = (result: 'W' | 'D' | 'L') => ({ result }) as any;
    // 시간순: W W L W W W
    const results = [mk('W'), mk('W'), mk('L'), mk('W'), mk('W'), mk('W')];
    expect(computeStreak(results)).toEqual({ current: 3, currentType: 'W', best: 3 });
  });
  it('경기 없으면 0/null', () => {
    expect(computeStreak([])).toEqual({ current: 0, currentType: null, best: 0 });
  });
});

describe('computeClutch', () => {
  it('5점차 이내 경기만 집계', () => {
    const mk = (margin: number, result: 'W' | 'D' | 'L') => ({ margin, result }) as any;
    const results = [mk(3, 'W'), mk(-2, 'L'), mk(10, 'W'), mk(0, 'D')];
    // 접전: margin 3, -2, 0 → 3경기 (1승 1무 1패)
    expect(computeClutch(results)).toEqual({
      games: 3, wins: 1, draws: 1, losses: 1, winRate: 33,
    });
  });
});
