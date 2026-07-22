import {
  buildGameResults,
  computeStreak,
  computeClutch,
  computeRecord,
  computeAverages,
  computeRecentForm,
  computeImpact,
  round1,
} from './team-impact.util';
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

describe('computeRecord', () => {
  it('승/무/패를 집계', () => {
    const mk = (result: 'W' | 'D' | 'L') => ({ result }) as any;
    expect(computeRecord([mk('W'), mk('W'), mk('D'), mk('L')])).toEqual({
      wins: 2,
      draws: 1,
      losses: 1,
    });
  });
});

describe('computeAverages', () => {
  it('내/상대 점수 평균과 마진을 소수 1자리로', () => {
    const mk = (myScore: number, oppScore: number) => ({ myScore, oppScore }) as any;
    // (10+15)/2=12.5, (8+9)/2=8.5, margin (2+6)/2=4
    expect(computeAverages([mk(10, 8), mk(15, 9)])).toEqual({
      avgTeamScore: 12.5,
      avgOpponentScore: 8.5,
      avgMargin: 4,
    });
  });
  it('경기 없으면 0', () => {
    expect(computeAverages([])).toEqual({ avgTeamScore: 0, avgOpponentScore: 0, avgMargin: 0 });
  });
});

describe('computeRecentForm', () => {
  it('최근 10경기만, 오래된→최신 순 유지', () => {
    const mk = (result: 'W' | 'D' | 'L') => ({ result }) as any;
    const results = Array.from({ length: 12 }, (_, i) => mk(i < 6 ? 'L' : 'W'));
    const form = computeRecentForm(results);
    expect(form).toHaveLength(10);
    expect(form).toEqual(['L', 'L', 'L', 'L', 'W', 'W', 'W', 'W', 'W', 'W']);
  });
});

describe('computeImpact', () => {
  it('승리/패배 경기 평균 개인 득점, 무는 제외', () => {
    const mk = (result: 'W' | 'D' | 'L', myPoints: number) => ({ result, myPoints }) as any;
    const out = computeImpact([mk('W', 10), mk('W', 20), mk('L', 4), mk('D', 99)]);
    expect(out).toEqual({ avgPointsInWins: 15, avgPointsInLosses: 4 });
  });
  it('승리 경기 없으면 null', () => {
    const mk = (result: 'W' | 'D' | 'L', myPoints: number) => ({ result, myPoints }) as any;
    expect(computeImpact([mk('L', 5)]).avgPointsInWins).toBeNull();
  });
});

describe('round1', () => {
  it('소수 1자리 반올림', () => {
    expect(round1(4.44)).toBe(4.4);
    expect(round1(4.46)).toBe(4.5);
  });
});
