import { computeAbility, percentileRank } from './ability.util';
import { AbilityRow, GamesPlayed } from './ability.types';

describe('percentileRank', () => {
  it('최고값은 높은 점수(높을수록 좋음)', () => {
    expect(percentileRank([10, 20, 30], 30, true)).toBe(83);
  });
  it('최저값은 낮은 점수(높을수록 좋음)', () => {
    expect(percentileRank([10, 20, 30], 10, true)).toBe(17);
  });
  it('전부 동점이면 50', () => {
    expect(percentileRank([5, 5, 5], 5, true)).toBe(50);
  });
  it('낮을수록 좋음: 최저값이 높은 점수', () => {
    expect(percentileRank([1, 2, 3], 1, false)).toBe(83);
  });
});

// 농구 표준 이름을 가진 2인 그룹. p1=득점형, p2=수비형.
function bballRows(): AbilityRow[] {
  return [
    // player 1
    { playerId: 1, name: '3점', count: 4, valueSum: 12 },
    { playerId: 1, name: '2점', count: 5, valueSum: 10 },
    { playerId: 1, name: '어시', count: 6, valueSum: 0 },
    { playerId: 1, name: '리바', count: 2, valueSum: 0 },
    { playerId: 1, name: '스틸', count: 1, valueSum: 0 },
    { playerId: 1, name: '턴오버', count: 4, valueSum: 0 },
    // player 2
    { playerId: 2, name: '2점', count: 2, valueSum: 4 },
    { playerId: 2, name: '어시', count: 1, valueSum: 0 },
    { playerId: 2, name: '리바', count: 8, valueSum: 0 },
    { playerId: 2, name: '스틸', count: 3, valueSum: 0 },
    { playerId: 2, name: '블록', count: 3, valueSum: 0 },
    { playerId: 2, name: '턴오버', count: 1, valueSum: 0 },
  ];
}
const bballGames: GamesPlayed[] = [
  { playerId: 1, gamesPlayed: 2 },
  { playerId: 2, gamesPlayed: 2 },
];

describe('computeAbility - basketball', () => {
  it('농구 표준 이름이면 mode=basketball, 6축', () => {
    const a = computeAbility({ rows: bballRows(), gamesPlayed: bballGames, targetPlayerId: 1, groupId: 1 });
    expect(a.mode).toBe('basketball');
    expect(a.axes.map((x) => x.key)).toEqual([
      'scoring', 'outside', 'assist', 'rebound', 'defense', 'stability',
    ]);
    expect(a.hasData).toBe(true);
    expect(a.groupSize).toBe(2);
  });

  it('득점형(p1)은 scoring/outside/assist에서 상위', () => {
    const a = computeAbility({ rows: bballRows(), gamesPlayed: bballGames, targetPlayerId: 1, groupId: 1 });
    const scoring = a.axes.find((x) => x.key === 'scoring')!;
    // p1 득점/게임 = (12+10)/2 = 11, p2 = 4/2 = 2 → p1이 최고
    expect(scoring.rawPerGame).toBe(11);
    expect(scoring.score).toBe(75); // 2인, 단독 최고: (1+0.5)/2=0.75
  });

  it('안정성은 턴오버 적을수록 높은 점수(역산)', () => {
    // p1 턴오버/게임=2, p2=0.5 → p2가 더 안정적 → p2 안정성 점수가 더 높아야
    const a1 = computeAbility({ rows: bballRows(), gamesPlayed: bballGames, targetPlayerId: 1, groupId: 1 });
    const a2 = computeAbility({ rows: bballRows(), gamesPlayed: bballGames, targetPlayerId: 2, groupId: 1 });
    const s1 = a1.axes.find((x) => x.key === 'stability')!;
    const s2 = a2.axes.find((x) => x.key === 'stability')!;
    expect(s2.score!).toBeGreaterThan(s1.score!);
    expect(s1.higherIsBetter).toBe(false);
  });

  it('참여 게임 0인 선수는 hasData=false, score=null', () => {
    const a = computeAbility({ rows: bballRows(), gamesPlayed: bballGames, targetPlayerId: 99, groupId: 1 });
    expect(a.hasData).toBe(false);
    expect(a.axes.every((x) => x.score === null)).toBe(true);
  });
});

describe('computeAbility - dynamic fallback', () => {
  const customRows: AbilityRow[] = [
    { playerId: 1, name: '펀치', count: 10, valueSum: 0 },
    { playerId: 1, name: '킥', count: 8, valueSum: 0 },
    { playerId: 1, name: '방어', count: 6, valueSum: 0 },
    { playerId: 1, name: '클린치', count: 4, valueSum: 0 },
    { playerId: 2, name: '펀치', count: 5, valueSum: 0 },
    { playerId: 2, name: '킥', count: 12, valueSum: 0 },
    { playerId: 2, name: '방어', count: 2, valueSum: 0 },
  ];
  const games: GamesPlayed[] = [
    { playerId: 1, gamesPlayed: 2 },
    { playerId: 2, gamesPlayed: 2 },
  ];

  it('농구 매핑이 4축 미만이면 mode=dynamic', () => {
    const a = computeAbility({ rows: customRows, gamesPlayed: games, targetPlayerId: 1, groupId: 3 });
    expect(a.mode).toBe('dynamic');
  });

  it('동적 축은 사용빈도 상위 이름, 전부 higherIsBetter', () => {
    const a = computeAbility({ rows: customRows, gamesPlayed: games, targetPlayerId: 1, groupId: 3 });
    expect(a.axes.map((x) => x.label)).toEqual(['킥', '펀치', '방어', '클린치']);
    expect(a.axes.every((x) => x.higherIsBetter)).toBe(true);
  });

  it('매핑 가능한 이름이 3종 미만이면 hasData=false', () => {
    const tiny: AbilityRow[] = [
      { playerId: 1, name: '펀치', count: 3, valueSum: 0 },
      { playerId: 1, name: '킥', count: 2, valueSum: 0 },
    ];
    const a = computeAbility({ rows: tiny, gamesPlayed: [{ playerId: 1, gamesPlayed: 1 }], targetPlayerId: 1, groupId: 3 });
    expect(a.hasData).toBe(false);
    expect(a.axes).toHaveLength(0);
  });
});

describe('computeAbility - basketball/dynamic 경계 (mappable 3 vs 4)', () => {
  const games: GamesPlayed[] = [
    { playerId: 1, gamesPlayed: 1 },
    { playerId: 2, gamesPlayed: 1 },
  ];

  it('농구 축 3개만 매핑되면 dynamic', () => {
    // 어시/리바/스틸 → assist·rebound·defense = 3축 매핑 (scoring/outside/stability 미매핑)
    const rows: AbilityRow[] = [
      { playerId: 1, name: '어시', count: 2, valueSum: 0 },
      { playerId: 1, name: '리바', count: 2, valueSum: 0 },
      { playerId: 1, name: '스틸', count: 1, valueSum: 0 },
      { playerId: 2, name: '리바', count: 3, valueSum: 0 },
    ];
    const a = computeAbility({ rows, gamesPlayed: games, targetPlayerId: 1, groupId: 4 });
    expect(a.mode).toBe('dynamic');
  });

  it('농구 축 4개 매핑되면 basketball(6축)', () => {
    // 어시/리바/스틸/턴오버 → assist·rebound·defense·stability = 4축 매핑
    const rows: AbilityRow[] = [
      { playerId: 1, name: '어시', count: 2, valueSum: 0 },
      { playerId: 1, name: '리바', count: 2, valueSum: 0 },
      { playerId: 1, name: '스틸', count: 1, valueSum: 0 },
      { playerId: 1, name: '턴오버', count: 1, valueSum: 0 },
      { playerId: 2, name: '리바', count: 3, valueSum: 0 },
    ];
    const a = computeAbility({ rows, gamesPlayed: games, targetPlayerId: 1, groupId: 4 });
    expect(a.mode).toBe('basketball');
    expect(a.axes).toHaveLength(6);
  });
});
