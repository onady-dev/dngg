# 선수 상세 — 팀 기여도 카드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선수 상세 페이지에서 일자별 기록 행을 제거하고, 완료 경기 기록으로 계산한 "팀 기여도" 카드(전적/팀 득실/개인 기여/능력/케미)를 추가한다.

**Architecture:** 백엔드에 신규 조회 엔드포인트 `GET /player/:id/team-impact`를 추가한다. 리포지토리가 완료 경기 대상 집계 4쿼리를 던지고, 순수 함수 `computeTeamImpact`가 응답 객체를 계산한다(TDD). 프론트는 능력치와 동일한 독립 fetch로 데이터를 받아 신규 `TeamImpactCard`로 렌더한다.

**Tech Stack:** NestJS 11 + TypeORM(QueryBuilder), Jest / Next.js 14 App Router + styled-components. 패키지 매니저 pnpm.

## Global Constraints

- 커밋 메시지 제목·본문은 **한글**, conventional 타입 접두어는 영문(`feat:`, `test:`, `refactor:` 등).
- 스키마 변경 금지 — 신규 엔티티/컬럼 없음, 마이그레이션 없음.
- 삭제된 선수의 로그는 점수/집계에서 제외한다(`log.player` INNER JOIN). 삭제/진행중 게임 제외, **FINISHED만** 집계.
- 백엔드 테스트: `cd backend && pnpm test -- <파일>`. 프론트는 단위 테스트 없음 → `cd frontend && pnpm lint` + 수동 스모크로 검증.
- 상수: `CLOSE_MARGIN = 5`, `RECENT_FORM_LIMIT = 10`, `MIN_CHEMISTRY_GAMES = 3`, `MAX_CHEMISTRY = 3`.
- 반올림: 평균/비율은 소수 1자리(`round1`), 승률/기여%는 반올림 정수.

---

### Task 1: 계산 유틸 (1) — 타입 + 게임 결과 + 전적/득실/접전/폼/연승/임팩트

**Files:**
- Create: `backend/src/modules/player/team-impact.types.ts`
- Create: `backend/src/modules/player/team-impact.util.ts`
- Test: `backend/src/modules/player/team-impact.util.spec.ts`

**Interfaces:**
- Produces: `team-impact.types.ts`의 모든 타입, `buildGameResults(games, teamAgg, selfAgg): GameResult[]`, 그리고 내부 헬퍼 `computeRecord/computeAverages/computeClutch/computeRecentForm/computeStreak/computeImpact`. 이 태스크는 `GameResult`와 점수→결과 파생을 확정한다.

- [ ] **Step 1: 타입 파일 작성**

Create `backend/src/modules/player/team-impact.types.ts`:

```ts
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
```

- [ ] **Step 2: 실패하는 테스트 작성**

Create `backend/src/modules/player/team-impact.util.spec.ts`:

```ts
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
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd backend && pnpm test -- team-impact.util.spec.ts`
Expected: FAIL — "Cannot find module './team-impact.util'".

- [ ] **Step 4: 유틸 구현 (이 태스크 범위)**

Create `backend/src/modules/player/team-impact.util.ts`:

```ts
import { GameRow, TeamAggRow, SelfAggRow } from './team-impact.types';

export const CLOSE_MARGIN = 5;
export const RECENT_FORM_LIMIT = 10;
export const MIN_CHEMISTRY_GAMES = 3;
export const MAX_CHEMISTRY = 3;

export type Result = 'W' | 'D' | 'L';

export interface GameResult {
  gameId: number;
  team: 'home' | 'away';
  myScore: number;
  oppScore: number;
  margin: number;
  result: Result;
  myPoints: number;
}

export const round1 = (n: number): number => Math.round(n * 10) / 10;

// 게임별 결과를 날짜 오름차순(동일 날짜는 gameId 오름차순)으로 파생한다.
export function buildGameResults(
  games: GameRow[],
  teamAgg: TeamAggRow[],
  selfAgg: SelfAggRow[],
): GameResult[] {
  const scoreByGameTeam = new Map<string, number>();
  teamAgg.forEach((r) => {
    const key = `${r.gameId}:${r.team}`;
    scoreByGameTeam.set(key, (scoreByGameTeam.get(key) ?? 0) + r.valueSum);
  });
  const myPointsByGame = new Map<number, number>();
  selfAgg.forEach((r) => {
    myPointsByGame.set(r.gameId, (myPointsByGame.get(r.gameId) ?? 0) + r.valueSum);
  });

  const sorted = [...games].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.gameId - b.gameId;
  });

  return sorted.map((g) => {
    const oppTeam = g.team === 'home' ? 'away' : 'home';
    const myScore = scoreByGameTeam.get(`${g.gameId}:${g.team}`) ?? 0;
    const oppScore = scoreByGameTeam.get(`${g.gameId}:${oppTeam}`) ?? 0;
    const margin = myScore - oppScore;
    const result: Result = margin > 0 ? 'W' : margin < 0 ? 'L' : 'D';
    return {
      gameId: g.gameId,
      team: g.team,
      myScore,
      oppScore,
      margin,
      result,
      myPoints: myPointsByGame.get(g.gameId) ?? 0,
    };
  });
}

export function computeRecord(results: GameResult[]) {
  let wins = 0, draws = 0, losses = 0;
  results.forEach((r) => {
    if (r.result === 'W') wins++;
    else if (r.result === 'D') draws++;
    else losses++;
  });
  return { wins, draws, losses };
}

export function computeAverages(results: GameResult[]) {
  const n = results.length;
  if (n === 0) return { avgTeamScore: 0, avgOpponentScore: 0, avgMargin: 0 };
  const team = results.reduce((s, r) => s + r.myScore, 0);
  const opp = results.reduce((s, r) => s + r.oppScore, 0);
  return {
    avgTeamScore: round1(team / n),
    avgOpponentScore: round1(opp / n),
    avgMargin: round1((team - opp) / n),
  };
}

export function computeClutch(results: GameResult[]) {
  const close = results.filter((r) => Math.abs(r.margin) <= CLOSE_MARGIN);
  let wins = 0, draws = 0, losses = 0;
  close.forEach((r) => {
    if (r.result === 'W') wins++;
    else if (r.result === 'D') draws++;
    else losses++;
  });
  const games = close.length;
  return {
    games,
    wins,
    draws,
    losses,
    winRate: games > 0 ? Math.round((wins / games) * 100) : null,
  };
}

export function computeRecentForm(results: GameResult[]): Result[] {
  return results.slice(-RECENT_FORM_LIMIT).map((r) => r.result);
}

export function computeStreak(results: GameResult[]) {
  let best = 0;
  let run = 0;
  results.forEach((r) => {
    if (r.result === 'W') {
      run++;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  });
  let current = 0;
  let currentType: Result | null = null;
  for (let i = results.length - 1; i >= 0; i--) {
    if (i === results.length - 1) {
      currentType = results[i].result;
      current = 1;
    } else if (results[i].result === currentType) {
      current++;
    } else {
      break;
    }
  }
  return { current, currentType, best };
}

export function computeImpact(results: GameResult[]) {
  const avg = (arr: GameResult[]) =>
    arr.length ? round1(arr.reduce((s, r) => s + r.myPoints, 0) / arr.length) : null;
  return {
    avgPointsInWins: avg(results.filter((r) => r.result === 'W')),
    avgPointsInLosses: avg(results.filter((r) => r.result === 'L')),
  };
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd backend && pnpm test -- team-impact.util.spec.ts`
Expected: PASS (3 describe 블록 모두).

- [ ] **Step 6: 커밋**

```bash
git add backend/src/modules/player/team-impact.types.ts backend/src/modules/player/team-impact.util.ts backend/src/modules/player/team-impact.util.spec.ts
git commit -m "feat: 팀 기여도 계산 유틸 기반(게임 결과·전적·득실·접전·폼·연승) 추가"
```

---

### Task 2: 계산 유틸 (2) — 개인 기여도 + 능력 지표

**Files:**
- Modify: `backend/src/modules/player/team-impact.util.ts`
- Test: `backend/src/modules/player/team-impact.util.spec.ts` (append)

**Interfaces:**
- Consumes: `GameRow/TeamAggRow/SelfAggRow`, `round1` (Task 1).
- Produces: `computeContributions(games, teamAgg, selfAgg): ContributionShare[]`, `computeAbility(selfAgg, finishedGames): { effPerGame, astToRatio, astCount, toCount }`. 카테고리 판정자 `isScoring/isAssist/isRebound/isDefense/isTurnover/isFoul`.

- [ ] **Step 1: 실패하는 테스트 추가**

Append to `backend/src/modules/player/team-impact.util.spec.ts`:

```ts
import { computeContributions, computeAbility } from './team-impact.util';

describe('computeContributions', () => {
  const games = [
    { gameId: 1, team: 'home' as const, date: '2026-07-08' },
    { gameId: 2, team: 'away' as const, date: '2026-07-10' },
  ];
  // 내 팀: g1=home, g2=away. 다른 팀 로그는 분모에서 제외돼야 한다.
  const teamAgg = [
    { gameId: 1, team: 'home', name: '2점', count: 10, valueSum: 20 },
    { gameId: 1, team: 'away', name: '2점', count: 99, valueSum: 198 }, // 무시
    { gameId: 1, team: 'home', name: '어시', count: 4, valueSum: 0 },
    { gameId: 2, team: 'away', name: '어시', count: 6, valueSum: 0 },
  ];
  const selfAgg = [
    { gameId: 1, name: '2점', count: 3, valueSum: 6 },
    { gameId: 1, name: '어시', count: 2, valueSum: 0 },
    { gameId: 2, name: '어시', count: 3, valueSum: 0 },
  ];

  it('내 팀 합 대비 본인 비중 + 카테고리 present 판정', () => {
    const out = computeContributions(games as any, teamAgg as any, selfAgg as any);
    const scoring = out.find((c) => c.key === 'scoring')!;
    const assist = out.find((c) => c.key === 'assist')!;
    const rebound = out.find((c) => c.key === 'rebound')!;
    // 득점: 본인 6 / 내팀(g1 home) 20 = 30%
    expect(scoring).toMatchObject({ share: 30, present: true });
    // 어시: 본인 5 / 내팀(g1 home 4 + g2 away 6 = 10) = 50%
    expect(assist).toMatchObject({ share: 50, present: true });
    // 리바: 로그에 전혀 없음 → present false, share null
    expect(rebound).toMatchObject({ share: null, present: false });
  });
});

describe('computeAbility', () => {
  const selfAgg = [
    { gameId: 1, name: '3점', count: 2, valueSum: 6 },
    { gameId: 1, name: '리바', count: 3, valueSum: 0 },
    { gameId: 1, name: '어시', count: 4, valueSum: 0 },
    { gameId: 1, name: '스틸', count: 1, valueSum: 0 },
    { gameId: 1, name: '턴오버', count: 2, valueSum: 0 },
  ];

  it('EFF = (득점+리바+어시+스틸+블록−턴오버−파울)/게임, AST/TO 계산', () => {
    const out = computeAbility(selfAgg as any, 1);
    // 6 + 3 + 4 + 1 + 0 - 2 - 0 = 12 → /1게임 = 12
    expect(out.effPerGame).toBe(12);
    expect(out.astCount).toBe(4);
    expect(out.toCount).toBe(2);
    expect(out.astToRatio).toBe(2);
  });

  it('턴오버 0이면 AST/TO는 null', () => {
    const out = computeAbility([{ gameId: 1, name: '어시', count: 3, valueSum: 0 }] as any, 1);
    expect(out.astToRatio).toBeNull();
    expect(out.astCount).toBe(3);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pnpm test -- team-impact.util.spec.ts`
Expected: FAIL — `computeContributions`/`computeAbility` is not a function.

- [ ] **Step 3: 판정자 + 함수 구현 추가**

`backend/src/modules/player/team-impact.util.ts` 상단 import 줄을 아래로 교체(타입 추가):
```ts
import { GameRow, TeamAggRow, SelfAggRow, ContributionShare } from './team-impact.types';
```
파일 끝에 다음을 추가:
```ts
export const isScoring = (n: string) =>
  n.includes('3점') || n.includes('2점') || n.includes('자유투');
export const isAssist = (n: string) => n.includes('어시');
export const isRebound = (n: string) => n.includes('리바');
export const isDefense = (n: string) => n.includes('스틸') || n.includes('블록');
export const isTurnover = (n: string) => n.includes('턴오버');
export const isFoul = (n: string) => n.includes('파울');

export function computeContributions(
  games: GameRow[],
  teamAgg: TeamAggRow[],
  selfAgg: SelfAggRow[],
): ContributionShare[] {
  const myTeamByGame = new Map<number, string>();
  games.forEach((g) => myTeamByGame.set(g.gameId, g.team));

  const cats = [
    { key: 'scoring' as const, label: '득점', match: isScoring, useValue: true },
    { key: 'assist' as const, label: '어시스트', match: isAssist, useValue: false },
    { key: 'rebound' as const, label: '리바운드', match: isRebound, useValue: false },
    { key: 'defense' as const, label: '수비', match: isDefense, useValue: false },
  ];

  const allNames = new Set<string>();
  teamAgg.forEach((r) => allNames.add(r.name));
  selfAgg.forEach((r) => allNames.add(r.name));

  const amount = (r: { count: number; valueSum: number }, useValue: boolean) =>
    useValue ? r.valueSum : r.count;

  return cats.map((cat) => {
    const present = [...allNames].some((n) => cat.match(n));
    const teamTotal = teamAgg
      .filter((r) => cat.match(r.name) && myTeamByGame.get(r.gameId) === r.team)
      .reduce((s, r) => s + amount(r, cat.useValue), 0);
    const selfTotal = selfAgg
      .filter((r) => cat.match(r.name))
      .reduce((s, r) => s + amount(r, cat.useValue), 0);
    const share = teamTotal > 0 ? Math.round((selfTotal / teamTotal) * 100) : null;
    return { key: cat.key, label: cat.label, share, present };
  });
}

export function computeAbility(selfAgg: SelfAggRow[], finishedGames: number) {
  const sumWhere = (pred: (n: string) => boolean, useValue: boolean) =>
    selfAgg
      .filter((r) => pred(r.name))
      .reduce((s, r) => s + (useValue ? r.valueSum : r.count), 0);

  const points = sumWhere(isScoring, true);
  const reb = sumWhere(isRebound, false);
  const ast = sumWhere(isAssist, false);
  const stl = selfAgg.filter((r) => r.name.includes('스틸')).reduce((s, r) => s + r.count, 0);
  const blk = selfAgg.filter((r) => r.name.includes('블록')).reduce((s, r) => s + r.count, 0);
  const to = sumWhere(isTurnover, false);
  const foul = sumWhere(isFoul, false);

  const effTotal = points + reb + ast + stl + blk - to - foul;
  return {
    effPerGame: finishedGames > 0 ? round1(effTotal / finishedGames) : 0,
    astToRatio: to > 0 ? round1(ast / to) : null,
    astCount: ast,
    toCount: to,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && pnpm test -- team-impact.util.spec.ts`
Expected: PASS (전체).

- [ ] **Step 5: 커밋**

```bash
git add backend/src/modules/player/team-impact.util.ts backend/src/modules/player/team-impact.util.spec.ts
git commit -m "feat: 팀 기여도 유틸에 개인 기여도·능력 지표(EFF·AST/TO) 계산 추가"
```

---

### Task 3: 계산 유틸 (3) — 케미 + 최상위 조립 `computeTeamImpact`

**Files:**
- Modify: `backend/src/modules/player/team-impact.util.ts`
- Test: `backend/src/modules/player/team-impact.util.spec.ts` (append)

**Interfaces:**
- Consumes: 모든 헬퍼 + `GameResult` (Task 1·2).
- Produces: `computeChemistry(games, results, roster): TeammateChemistry[]`, `computeTeamImpact(input): PlayerTeamImpact`. **서비스/리포지토리가 호출하는 최종 진입점.**
  - `input` = `{ games: GameRow[]; teamAgg: TeamAggRow[]; selfAgg: SelfAggRow[]; roster: RosterRow[]; targetPlayerId: number; groupId: number }`.

- [ ] **Step 1: 실패하는 테스트 추가**

Append to `backend/src/modules/player/team-impact.util.spec.ts`:

```ts
import { computeChemistry, computeTeamImpact } from './team-impact.util';

describe('computeChemistry', () => {
  const games = [
    { gameId: 1, team: 'home' as const, date: '2026-07-01' },
    { gameId: 2, team: 'home' as const, date: '2026-07-02' },
    { gameId: 3, team: 'home' as const, date: '2026-07-03' },
  ];
  const results = [
    { gameId: 1, result: 'W' },
    { gameId: 2, result: 'W' },
    { gameId: 3, result: 'L' },
  ] as any;
  // 동료 10(같은 팀 home 3경기: 2승 1패), 동료 20(상대 팀이라 제외), 동료 30(2경기 → 최소치 미달)
  const roster = [
    { gameId: 1, team: 'home', playerId: 10, name: '김철수' },
    { gameId: 2, team: 'home', playerId: 10, name: '김철수' },
    { gameId: 3, team: 'home', playerId: 10, name: '김철수' },
    { gameId: 1, team: 'away', playerId: 20, name: '상대편' },
    { gameId: 1, team: 'home', playerId: 30, name: '박민수' },
    { gameId: 2, team: 'home', playerId: 30, name: '박민수' },
  ];

  it('같은 팀 3경기 이상만, 승률 내림차순 상위 N', () => {
    const out = computeChemistry(games as any, results, roster as any);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      playerId: 10, name: '김철수', games: 3, wins: 2, losses: 1, winRate: 67,
    });
  });
});

describe('computeTeamImpact', () => {
  it('완료 경기 없으면 hasData=false, winRate=null', () => {
    const out = computeTeamImpact({
      games: [], teamAgg: [], selfAgg: [], roster: [], targetPlayerId: 5, groupId: 7,
    });
    expect(out).toMatchObject({
      playerId: 5, groupId: 7, finishedGames: 0, hasData: false, winRate: null,
    });
    expect(out.bestTeammates).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pnpm test -- team-impact.util.spec.ts`
Expected: FAIL — `computeChemistry`/`computeTeamImpact` is not a function.

- [ ] **Step 3: 구현 추가**

`backend/src/modules/player/team-impact.util.ts` 상단 import 줄을 아래 최종형으로 교체:
```ts
import {
  GameRow,
  TeamAggRow,
  SelfAggRow,
  RosterRow,
  ContributionShare,
  PlayerTeamImpact,
  TeammateChemistry,
} from './team-impact.types';
```
파일 끝에 다음을 추가:
```ts
export function computeChemistry(
  games: GameRow[],
  results: GameResult[],
  roster: RosterRow[],
): TeammateChemistry[] {
  const myTeamByGame = new Map<number, string>();
  games.forEach((g) => myTeamByGame.set(g.gameId, g.team));
  const resultByGame = new Map<number, Result>();
  results.forEach((r) => resultByGame.set(r.gameId, r.result));

  const acc = new Map<number, TeammateChemistry>();
  roster.forEach((row) => {
    if (myTeamByGame.get(row.gameId) !== row.team) return; // 같은 팀만
    const result = resultByGame.get(row.gameId);
    if (!result) return;
    const cur =
      acc.get(row.playerId) ??
      { playerId: row.playerId, name: row.name, games: 0, wins: 0, draws: 0, losses: 0, winRate: 0 };
    cur.games++;
    if (result === 'W') cur.wins++;
    else if (result === 'D') cur.draws++;
    else cur.losses++;
    acc.set(row.playerId, cur);
  });

  return [...acc.values()]
    .filter((t) => t.games >= MIN_CHEMISTRY_GAMES)
    .map((t) => ({ ...t, winRate: Math.round((t.wins / t.games) * 100) }))
    .sort((a, b) => b.winRate - a.winRate || b.games - a.games)
    .slice(0, MAX_CHEMISTRY);
}

export function computeTeamImpact(input: {
  games: GameRow[];
  teamAgg: TeamAggRow[];
  selfAgg: SelfAggRow[];
  roster: RosterRow[];
  targetPlayerId: number;
  groupId: number;
}): PlayerTeamImpact {
  const { games, teamAgg, selfAgg, roster, targetPlayerId, groupId } = input;
  const results = buildGameResults(games, teamAgg, selfAgg);
  const finishedGames = results.length;
  const record = computeRecord(results);
  const averages = computeAverages(results);

  return {
    playerId: targetPlayerId,
    groupId,
    finishedGames,
    hasData: finishedGames > 0,
    record,
    winRate: finishedGames > 0 ? Math.round((record.wins / finishedGames) * 100) : null,
    recentForm: computeRecentForm(results),
    streak: computeStreak(results),
    avgTeamScore: averages.avgTeamScore,
    avgOpponentScore: averages.avgOpponentScore,
    avgMargin: averages.avgMargin,
    clutch: computeClutch(results),
    contributions: computeContributions(games, teamAgg, selfAgg),
    ability: computeAbility(selfAgg, finishedGames),
    impact: computeImpact(results),
    bestTeammates: computeChemistry(games, results, roster),
  };
}
```

- [ ] **Step 4: 전체 유틸 테스트 통과 확인**

Run: `cd backend && pnpm test -- team-impact.util.spec.ts`
Expected: PASS (전체 describe).

- [ ] **Step 5: 커밋**

```bash
git add backend/src/modules/player/team-impact.util.ts backend/src/modules/player/team-impact.util.spec.ts
git commit -m "feat: 팀 기여도 유틸에 동료 케미·최상위 조립 함수 추가"
```

---

### Task 4: 리포지토리 — 완료 경기 집계 4쿼리

**Files:**
- Create: `backend/src/repository/team-impact.repository.ts`

**Interfaces:**
- Consumes: `GameRow/TeamAggRow/SelfAggRow/RosterRow` (Task 1).
- Produces: `TeamImpactRepository` with `findFinishedGames(playerId): Promise<GameRow[]>`, `aggregateTeamByItem(gameIds): Promise<TeamAggRow[]>`, `aggregateSelfByItem(playerId, gameIds): Promise<SelfAggRow[]>`, `findTeammates(playerId, gameIds): Promise<RosterRow[]>`.

> DB 의존이라 단위 테스트는 두지 않는다(`AbilityRepository`와 동일 방침). QueryBuilder + 관계 조인만 사용해 테이블명 하드코딩을 피한다. 삭제 선수 제외는 `.innerJoin('log.player', ...)`로 처리(데일리 점수 규칙과 일치).

- [ ] **Step 1: 리포지토리 작성**

Create `backend/src/repository/team-impact.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Log } from 'src/entities/Log.entity';
import { InGamePlayer } from 'src/entities/InGamePlayer.entity';
import {
  GameRow,
  TeamAggRow,
  SelfAggRow,
  RosterRow,
} from 'src/modules/player/team-impact.types';

@Injectable()
export class TeamImpactRepository {
  constructor(
    @InjectRepository(Log)
    private readonly logRepository: Repository<Log>,
  ) {}

  // 대상 선수의 완료(FINISHED) 경기 + 소속 팀 + 날짜
  async findFinishedGames(playerId: number): Promise<GameRow[]> {
    const rows = await this.logRepository.manager
      .createQueryBuilder(InGamePlayer, 'igp')
      .innerJoin('igp.game', 'game')
      .select('igp.gameId', 'gameId')
      .addSelect('igp.team', 'team')
      .addSelect('game.date', 'date')
      .where('igp.playerId = :playerId', { playerId })
      .andWhere("game.status = 'FINISHED'")
      .getRawMany();
    return rows.map((r) => ({
      gameId: Number(r.gameId),
      team: r.team,
      date: String(r.date),
    }));
  }

  // 게임별·팀별·항목별 집계 (삭제 선수 로그 제외)
  async aggregateTeamByItem(gameIds: number[]): Promise<TeamAggRow[]> {
    if (gameIds.length === 0) return [];
    const rows = await this.logRepository
      .createQueryBuilder('log')
      .innerJoin('log.logitem', 'logitem')
      .innerJoin('log.player', 'player') // FK 제거 정책: 삭제 선수 제외
      .innerJoin(
        InGamePlayer,
        'igp',
        'igp.gameId = log.gameId AND igp.playerId = log.playerId',
      )
      .select('log.gameId', 'gameId')
      .addSelect('igp.team', 'team')
      .addSelect('logitem.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(logitem.value)', 'valueSum')
      .where('log.gameId IN (:...gameIds)', { gameIds })
      .groupBy('log.gameId')
      .addGroupBy('igp.team')
      .addGroupBy('logitem.name')
      .getRawMany();
    return rows.map((r) => ({
      gameId: Number(r.gameId),
      team: r.team,
      name: r.name,
      count: Number(r.count),
      valueSum: Number(r.valueSum),
    }));
  }

  // 대상 선수 본인의 게임별·항목별 집계
  async aggregateSelfByItem(
    playerId: number,
    gameIds: number[],
  ): Promise<SelfAggRow[]> {
    if (gameIds.length === 0) return [];
    const rows = await this.logRepository
      .createQueryBuilder('log')
      .innerJoin('log.logitem', 'logitem')
      .select('log.gameId', 'gameId')
      .addSelect('logitem.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(logitem.value)', 'valueSum')
      .where('log.playerId = :playerId', { playerId })
      .andWhere('log.gameId IN (:...gameIds)', { gameIds })
      .groupBy('log.gameId')
      .addGroupBy('logitem.name')
      .getRawMany();
    return rows.map((r) => ({
      gameId: Number(r.gameId),
      name: r.name,
      count: Number(r.count),
      valueSum: Number(r.valueSum),
    }));
  }

  // 케미용: 완료 경기의 (본인 제외) 동료 로스터 (삭제 동료 제외)
  async findTeammates(
    playerId: number,
    gameIds: number[],
  ): Promise<RosterRow[]> {
    if (gameIds.length === 0) return [];
    const rows = await this.logRepository.manager
      .createQueryBuilder(InGamePlayer, 'igp')
      .innerJoin('igp.player', 'player') // 삭제 동료 제외 (이름 필요)
      .select('igp.gameId', 'gameId')
      .addSelect('igp.team', 'team')
      .addSelect('igp.playerId', 'playerId')
      .addSelect('player.name', 'name')
      .where('igp.gameId IN (:...gameIds)', { gameIds })
      .andWhere('igp.playerId != :playerId', { playerId })
      .getRawMany();
    return rows.map((r) => ({
      gameId: Number(r.gameId),
      team: r.team,
      playerId: Number(r.playerId),
      name: r.name,
    }));
  }
}
```

- [ ] **Step 2: 컴파일 확인**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json`
Expected: 에러 없음 (리포지토리 타입 정합).

- [ ] **Step 3: 커밋**

```bash
git add backend/src/repository/team-impact.repository.ts
git commit -m "feat: 팀 기여도 완료 경기 집계 리포지토리 추가"
```

---

### Task 5: 서비스·컨트롤러·모듈 배선 + 서비스 스펙

**Files:**
- Modify: `backend/src/modules/player/player.service.ts`
- Modify: `backend/src/modules/player/player.controller.ts`
- Modify: `backend/src/modules/player/player.module.ts`
- Modify: `backend/src/modules/player/player.service.ability.spec.ts` (생성자 인자 추가)
- Test: `backend/src/modules/player/player.service.team-impact.spec.ts`

**Interfaces:**
- Consumes: `computeTeamImpact` (Task 3), `TeamImpactRepository` (Task 4).
- Produces: `PlayerService.getPlayerTeamImpact(id): Promise<PlayerTeamImpact>`, 라우트 `GET /player/:id/team-impact`.

- [ ] **Step 1: 실패하는 서비스 스펙 작성**

Create `backend/src/modules/player/player.service.team-impact.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { PlayerService } from './player.service';

describe('PlayerService.getPlayerTeamImpact', () => {
  const makeService = (overrides: any = {}) => {
    const playerRepository = {
      findById: jest.fn().mockResolvedValue({ id: 1, groupId: 7 }),
      ...overrides.playerRepository,
    };
    const teamImpactRepository = {
      findFinishedGames: jest.fn().mockResolvedValue([
        { gameId: 1, team: 'home', date: '2026-07-08' },
      ]),
      aggregateTeamByItem: jest.fn().mockResolvedValue([
        { gameId: 1, team: 'home', name: '2점', count: 6, valueSum: 12 },
        { gameId: 1, team: 'away', name: '2점', count: 5, valueSum: 10 },
      ]),
      aggregateSelfByItem: jest.fn().mockResolvedValue([
        { gameId: 1, name: '2점', count: 2, valueSum: 4 },
      ]),
      findTeammates: jest.fn().mockResolvedValue([]),
      ...overrides.teamImpactRepository,
    };
    const service = new PlayerService(
      playerRepository as any,
      {} as any, // inGamePlayersRepository (미사용)
      {} as any, // abilityRepository (미사용)
      teamImpactRepository as any,
    );
    return { service, playerRepository, teamImpactRepository };
  };

  it('완료 경기 집계로 팀 기여도를 계산해 반환', async () => {
    const { service, teamImpactRepository } = makeService();
    const result = await service.getPlayerTeamImpact(1);
    expect(teamImpactRepository.findFinishedGames).toHaveBeenCalledWith(1);
    expect(teamImpactRepository.aggregateTeamByItem).toHaveBeenCalledWith([1]);
    expect(result.playerId).toBe(1);
    expect(result.groupId).toBe(7);
    expect(result.finishedGames).toBe(1);
    expect(result.record).toEqual({ wins: 1, draws: 0, losses: 0 }); // 12 > 10 승
    expect(result.winRate).toBe(100);
  });

  it('선수가 없으면 404이며 집계를 호출하지 않는다', async () => {
    const { service, teamImpactRepository } = makeService({
      playerRepository: { findById: jest.fn().mockResolvedValue(null) },
    });
    await expect(service.getPlayerTeamImpact(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(teamImpactRepository.findFinishedGames).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pnpm test -- player.service.team-impact.spec.ts`
Expected: FAIL — `getPlayerTeamImpact` is not a function (및 생성자 인자 수 불일치).

- [ ] **Step 3: 서비스 구현**

In `backend/src/modules/player/player.service.ts`:

상단 import 추가:
```ts
import { TeamImpactRepository } from 'src/repository/team-impact.repository';
import { computeTeamImpact } from './team-impact.util';
import { PlayerTeamImpact } from './team-impact.types';
```

생성자에 4번째 주입 추가 (기존 3개 뒤):
```ts
  constructor(
    private readonly playerRepository: PlayerRepository,
    private readonly inGamePlayersRepository: InGamePlayersRepository,
    private readonly abilityRepository: AbilityRepository,
    private readonly teamImpactRepository: TeamImpactRepository,
  ) {}
```

`getPlayerAbility` 아래에 메서드 추가:
```ts
  async getPlayerTeamImpact(id: number): Promise<PlayerTeamImpact> {
    const player = await this.playerRepository.findById(id);
    if (!player) {
      throw new NotFoundException('선수를 찾을 수 없습니다.');
    }
    const groupId = player.groupId;
    const games = await this.teamImpactRepository.findFinishedGames(id);
    const gameIds = games.map((g) => g.gameId);
    const [teamAgg, selfAgg, roster] = await Promise.all([
      this.teamImpactRepository.aggregateTeamByItem(gameIds),
      this.teamImpactRepository.aggregateSelfByItem(id, gameIds),
      this.teamImpactRepository.findTeammates(id, gameIds),
    ]);
    return computeTeamImpact({
      games,
      teamAgg,
      selfAgg,
      roster,
      targetPlayerId: id,
      groupId,
    });
  }
```

- [ ] **Step 4: 컨트롤러 라우트 추가**

In `backend/src/modules/player/player.controller.ts`, `getPlayerAbility` 핸들러 아래에 추가:
```ts
  @Get(':id/team-impact')
  async getPlayerTeamImpact(@Param('id', ParseIntPipe) id: number) {
    return this.playerService.getPlayerTeamImpact(id);
  }
```

- [ ] **Step 5: 모듈 프로바이더 등록**

In `backend/src/modules/player/player.module.ts`:

import 추가:
```ts
import { TeamImpactRepository } from 'src/repository/team-impact.repository';
```
providers 배열에 `TeamImpactRepository` 추가 (`AbilityRepository` 뒤):
```ts
  providers: [
    PlayerService,
    PlayerRepository,
    InGamePlayersRepository,
    AbilityRepository,
    TeamImpactRepository,
  ],
```

- [ ] **Step 6: 기존 능력치 스펙의 생성자 호출 보정**

In `backend/src/modules/player/player.service.ability.spec.ts`, `new PlayerService(...)` 호출에 4번째 인자 추가:
```ts
    const service = new PlayerService(
      playerRepository as any,
      {} as any, // inGamePlayersRepository (미사용)
      abilityRepository as any,
      {} as any, // teamImpactRepository (미사용)
    );
```

- [ ] **Step 7: 관련 테스트 통과 확인**

Run: `cd backend && pnpm test -- player.service`
Expected: PASS (`player.service.team-impact.spec.ts`, `player.service.ability.spec.ts`, `player.service.group-access.spec.ts` 모두).

- [ ] **Step 8: 커밋**

```bash
git add backend/src/modules/player/player.service.ts backend/src/modules/player/player.controller.ts backend/src/modules/player/player.module.ts backend/src/modules/player/player.service.ability.spec.ts backend/src/modules/player/player.service.team-impact.spec.ts
git commit -m "feat: GET /player/:id/team-impact 엔드포인트 추가"
```

---

### Task 6: 프론트 타입 추가

**Files:**
- Modify: `frontend/src/app/player/[id]/types.ts`

**Interfaces:**
- Produces: 프론트 `PlayerTeamImpact` 및 하위 타입(백엔드 응답과 동일 형태). Task 7·8이 import한다.

- [ ] **Step 1: 타입 추가**

Append to `frontend/src/app/player/[id]/types.ts`:

```ts
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
```

- [ ] **Step 2: 컴파일 확인 & 커밋**

Run: `cd frontend && npx tsc --noEmit`
Expected: 에러 없음.

```bash
git add frontend/src/app/player/[id]/types.ts
git commit -m "feat: 프론트 팀 기여도 응답 타입 추가"
```

---

### Task 7: TeamImpactCard 컴포넌트 + 스타일 (디자인)

> 실행 순서: Task 7을 Task 8보다 **먼저** 만든다(Task 8이 이 컴포넌트를 import하므로).

**Files:**
- Create: `frontend/src/app/player/[id]/TeamImpactCard.tsx`
- Create: `frontend/src/app/player/[id]/styles/TeamImpactStyles.ts`

**Interfaces:**
- Consumes: `PlayerTeamImpact` (Task 6).
- Produces: `default export function TeamImpactCard({ impact }: { impact: PlayerTeamImpact | null })`.

- [ ] **Step 1: 스타일 파일 작성**

Create `frontend/src/app/player/[id]/styles/TeamImpactStyles.ts`:

```ts
"use client";

import styled from "styled-components";

export const Card = styled.section`
  background-color: white;
  border-radius: 1rem;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(0, 0, 0, 0.05);

  @media (max-width: 640px) {
    padding: 1rem;
    border-radius: 0.75rem;
    margin-bottom: 1rem;
  }
`;

export const CardHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
`;

export const CardTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  color: #1e293b;
`;

export const CountBadge = styled.span`
  padding: 0.125rem 0.5rem;
  background-color: #eff6ff;
  color: #1d4ed8;
  border-radius: 1rem;
  font-size: 0.75rem;
  font-weight: 600;
`;

export const Section = styled.div`
  padding: 1rem 0;
  border-top: 1px solid #f1f5f9;

  &:first-of-type {
    border-top: none;
    padding-top: 0;
  }
`;

export const SectionLabel = styled.h3`
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #94a3b8;
  margin-bottom: 0.75rem;
`;

/* 전적: 게이지 + 폼/연승 */
export const RecordRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1.25rem;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
`;

export const GaugeWrap = styled.div`
  position: relative;
  width: 88px;
  height: 88px;
  flex-shrink: 0;
`;

export const GaugeLabel = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

export const GaugeValue = styled.span`
  font-size: 1.25rem;
  font-weight: 800;
  color: #1d4ed8;
  line-height: 1;
`;

export const GaugeCaption = styled.span`
  font-size: 0.6875rem;
  color: #94a3b8;
  margin-top: 0.125rem;
`;

export const RecordMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

export const RecordLine = styled.div`
  font-size: 1rem;
  font-weight: 700;
  color: #1e293b;

  span.w {
    color: #2563eb;
  }
  span.l {
    color: #dc2626;
  }
  span.d {
    color: #64748b;
  }
`;

export const FormDots = styled.div`
  display: flex;
  gap: 0.25rem;
  align-items: center;
`;

export const Dot = styled.span<{ result: "W" | "D" | "L" }>`
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.625rem;
  font-weight: 700;
  color: white;
  background-color: ${({ result }) =>
    result === "W" ? "#2563eb" : result === "L" ? "#dc2626" : "#cbd5e1"};
`;

export const StreakText = styled.span`
  font-size: 0.8125rem;
  color: #64748b;
`;

/* 팀 득실 타일 */
export const Tiles = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.625rem;
`;

export const Tile = styled.div`
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.625rem;
  padding: 0.75rem;
  text-align: center;
`;

export const TileLabel = styled.div`
  font-size: 0.6875rem;
  color: #64748b;
  margin-bottom: 0.25rem;
`;

export const TileValue = styled.div<{ tone?: "up" | "down" | "neutral" }>`
  font-size: 1.25rem;
  font-weight: 800;
  color: ${({ tone }) =>
    tone === "up" ? "#2563eb" : tone === "down" ? "#dc2626" : "#0f172a"};

  @media (max-width: 640px) {
    font-size: 1.125rem;
  }
`;

export const ClutchLine = styled.p`
  margin-top: 0.75rem;
  font-size: 0.8125rem;
  color: #475569;

  strong {
    color: #1d4ed8;
    font-weight: 700;
  }
`;

/* 기여도 바 */
export const BarRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.625rem;

  &:last-child {
    margin-bottom: 0;
  }
`;

export const BarLabel = styled.span`
  width: 3.5rem;
  flex-shrink: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #475569;
`;

export const BarTrack = styled.div`
  flex: 1;
  height: 10px;
  background-color: #eef2f7;
  border-radius: 9999px;
  overflow: hidden;
`;

export const BarFill = styled.div<{ pct: number }>`
  height: 100%;
  width: ${({ pct }) => Math.max(0, Math.min(100, pct))}%;
  background: linear-gradient(90deg, #3b82f6, #1d4ed8);
  border-radius: 9999px;
`;

export const BarValue = styled.span`
  width: 3rem;
  flex-shrink: 0;
  text-align: right;
  font-size: 0.8125rem;
  font-weight: 700;
  color: #1e293b;
`;

/* 능력 지표 */
export const AbilityGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

export const AbilityItem = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #f1f5f9;

  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
`;

export const AbilityName = styled.span`
  font-size: 0.875rem;
  color: #475569;
`;

export const AbilityVal = styled.span`
  font-size: 0.9375rem;
  font-weight: 700;
  color: #1e293b;

  small {
    font-size: 0.75rem;
    font-weight: 500;
    color: #94a3b8;
    margin-left: 0.375rem;
  }
`;

/* 케미 리스트 */
export const MateList = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

export const MateRow = styled.li`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  font-size: 0.875rem;
`;

export const MateRank = styled.span`
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background-color: #eff6ff;
  color: #1d4ed8;
  font-size: 0.6875rem;
  font-weight: 700;
`;

export const MateName = styled.span`
  flex: 1;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const MateRecord = styled.span`
  color: #64748b;
  font-size: 0.8125rem;
`;

export const MateRate = styled.span`
  font-weight: 700;
  color: #1d4ed8;
`;

export const Caption = styled.p`
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #94a3b8;
`;

export const Empty = styled.p`
  padding: 1.5rem 1rem;
  text-align: center;
  color: #94a3b8;
  font-size: 0.9375rem;
`;
```

- [ ] **Step 2: 컴포넌트 작성**

Create `frontend/src/app/player/[id]/TeamImpactCard.tsx`:

```tsx
"use client";

import React from "react";
import { PlayerTeamImpact, GameResultLetter } from "./types";
import * as S from "./styles/TeamImpactStyles";

interface Props {
  impact: PlayerTeamImpact | null;
}

const RESULT_TEXT: Record<GameResultLetter, string> = { W: "승", D: "무", L: "패" };

function WinRateGauge({ value }: { value: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * c;
  return (
    <S.GaugeWrap>
      <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden>
        <circle cx="44" cy="44" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke="url(#wr)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform="rotate(-90 44 44)"
        />
        <defs>
          <linearGradient id="wr" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
        </defs>
      </svg>
      <S.GaugeLabel>
        <S.GaugeValue>{value}%</S.GaugeValue>
        <S.GaugeCaption>승률</S.GaugeCaption>
      </S.GaugeLabel>
    </S.GaugeWrap>
  );
}

export default function TeamImpactCard({ impact }: Props) {
  if (!impact) return null;

  if (!impact.hasData) {
    return (
      <S.Card>
        <S.CardHead>
          <S.CardTitle>팀 기여도</S.CardTitle>
        </S.CardHead>
        <S.Empty>완료된 경기가 없어 아직 집계할 수 없습니다.</S.Empty>
      </S.Card>
    );
  }

  const { record, streak, clutch, ability, impact: pts } = impact;
  const contributions = impact.contributions.filter((c) => c.present);

  const streakLabel =
    streak.currentType && streak.current > 0
      ? `현재 ${streak.current}${streak.currentType === "W" ? "연승" : streak.currentType === "L" ? "연패" : "연속 무"}`
      : null;

  const maxImpact = Math.max(pts.avgPointsInWins ?? 0, pts.avgPointsInLosses ?? 0, 1);

  return (
    <S.Card>
      <S.CardHead>
        <S.CardTitle>팀 기여도</S.CardTitle>
        <S.CountBadge>완료 {impact.finishedGames}경기</S.CountBadge>
      </S.CardHead>

      {/* 전적 */}
      <S.Section>
        <S.SectionLabel>전적</S.SectionLabel>
        <S.RecordRow>
          <WinRateGauge value={impact.winRate ?? 0} />
          <S.RecordMeta>
            <S.RecordLine>
              <span className="w">{record.wins}승</span>
              {" · "}
              <span className="d">{record.draws}무</span>
              {" · "}
              <span className="l">{record.losses}패</span>
            </S.RecordLine>
            {impact.recentForm.length > 0 && (
              <S.FormDots>
                {impact.recentForm.map((res, i) => (
                  <S.Dot key={i} result={res} title={RESULT_TEXT[res]}>
                    {RESULT_TEXT[res]}
                  </S.Dot>
                ))}
              </S.FormDots>
            )}
            <S.StreakText>
              {streakLabel ? `${streakLabel} · ` : ""}최다 {streak.best}연승
            </S.StreakText>
          </S.RecordMeta>
        </S.RecordRow>
      </S.Section>

      {/* 팀 득실 */}
      <S.Section>
        <S.SectionLabel>팀 득실</S.SectionLabel>
        <S.Tiles>
          <S.Tile>
            <S.TileLabel>평균 득점</S.TileLabel>
            <S.TileValue tone="up">{impact.avgTeamScore}</S.TileValue>
          </S.Tile>
          <S.Tile>
            <S.TileLabel>평균 실점</S.TileLabel>
            <S.TileValue tone="down">{impact.avgOpponentScore}</S.TileValue>
          </S.Tile>
          <S.Tile>
            <S.TileLabel>득실 마진</S.TileLabel>
            <S.TileValue tone={impact.avgMargin >= 0 ? "up" : "down"}>
              {impact.avgMargin > 0 ? `+${impact.avgMargin}` : impact.avgMargin}
            </S.TileValue>
          </S.Tile>
        </S.Tiles>
        {clutch.games > 0 && (
          <S.ClutchLine>
            접전(5점차 이내) {clutch.wins}승 {clutch.draws}무 {clutch.losses}패
            {clutch.winRate !== null && (
              <>
                {" · 승률 "}
                <strong>{clutch.winRate}%</strong>
              </>
            )}
          </S.ClutchLine>
        )}
      </S.Section>

      {/* 개인 기여 */}
      {contributions.length > 0 && (
        <S.Section>
          <S.SectionLabel>개인 기여 (팀 대비 비중)</S.SectionLabel>
          {contributions.map((c) => (
            <S.BarRow key={c.key}>
              <S.BarLabel>{c.label}</S.BarLabel>
              <S.BarTrack>
                <S.BarFill pct={c.share ?? 0} />
              </S.BarTrack>
              <S.BarValue>{c.share !== null ? `${c.share}%` : "-"}</S.BarValue>
            </S.BarRow>
          ))}
        </S.Section>
      )}

      {/* 능력 지표 */}
      <S.Section>
        <S.SectionLabel>능력 지표</S.SectionLabel>
        <S.AbilityGrid>
          <S.AbilityItem>
            <S.AbilityName>종합 기여 지수 (EFF)</S.AbilityName>
            <S.AbilityVal>
              {ability.effPerGame}
              <small>/ 게임</small>
            </S.AbilityVal>
          </S.AbilityItem>
          <S.AbilityItem>
            <S.AbilityName>어시–턴오버 비율</S.AbilityName>
            <S.AbilityVal>
              {ability.astToRatio !== null ? ability.astToRatio : "—"}
              <small>
                어시 {ability.astCount} / 턴오버 {ability.toCount}
              </small>
            </S.AbilityVal>
          </S.AbilityItem>
          {(pts.avgPointsInWins !== null || pts.avgPointsInLosses !== null) && (
            <>
              <S.BarRow>
                <S.BarLabel>승리 시</S.BarLabel>
                <S.BarTrack>
                  <S.BarFill pct={((pts.avgPointsInWins ?? 0) / maxImpact) * 100} />
                </S.BarTrack>
                <S.BarValue>
                  {pts.avgPointsInWins !== null ? `${pts.avgPointsInWins}점` : "-"}
                </S.BarValue>
              </S.BarRow>
              <S.BarRow>
                <S.BarLabel>패배 시</S.BarLabel>
                <S.BarTrack>
                  <S.BarFill pct={((pts.avgPointsInLosses ?? 0) / maxImpact) * 100} />
                </S.BarTrack>
                <S.BarValue>
                  {pts.avgPointsInLosses !== null ? `${pts.avgPointsInLosses}점` : "-"}
                </S.BarValue>
              </S.BarRow>
            </>
          )}
        </S.AbilityGrid>
        <S.Caption>EFF = 득점＋리바＋어시＋스틸＋블록－턴오버－파울 (게임당, 미스슛 미기록 간이 지표)</S.Caption>
      </S.Section>

      {/* 케미 */}
      {impact.bestTeammates.length > 0 && (
        <S.Section>
          <S.SectionLabel>가장 잘 맞는 동료 (3경기 이상)</S.SectionLabel>
          <S.MateList>
            {impact.bestTeammates.map((m, i) => (
              <S.MateRow key={m.playerId}>
                <S.MateRank>{i + 1}</S.MateRank>
                <S.MateName>{m.name}</S.MateName>
                <S.MateRecord>
                  {m.wins}승 {m.draws > 0 ? `${m.draws}무 ` : ""}{m.losses}패
                </S.MateRecord>
                <S.MateRate>{m.winRate}%</S.MateRate>
              </S.MateRow>
            ))}
          </S.MateList>
        </S.Section>
      )}
    </S.Card>
  );
}
```

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/app/player/[id]/TeamImpactCard.tsx frontend/src/app/player/[id]/styles/TeamImpactStyles.ts
git commit -m "feat: 팀 기여도 카드 컴포넌트·스타일 추가"
```

---

### Task 8: 데이터 로딩 + 일자별 표 제거 + 카드 마운트

**Files:**
- Modify: `frontend/src/app/player/[id]/PlayerDetail.tsx`
- Modify: `frontend/src/app/player/[id]/PlayerDetailClient.tsx`

**Interfaces:**
- Consumes: `PlayerTeamImpact` (Task 6), `TeamImpactCard` (Task 7).
- Produces: `PlayerDetailClient`가 `teamImpact` prop을 받아 요약 표 위에 카드를 렌더.

- [ ] **Step 1: `PlayerDetail.tsx` — 독립 fetch 추가**

`import` 블록의 types import를 아래로 교체:
```ts
import { GameRecord, GroupPlayer, PlayerAbility, PlayerTeamImpact } from "./types";
```
state 추가 (`ability` state 근처):
```ts
  const [teamImpact, setTeamImpact] = useState<PlayerTeamImpact | null>(null);
```
`ability` 독립 fetch(`api.get(\`/player/${playerId}/ability\`)...`) 블록 **바로 아래**에 동일 패턴으로 추가:
```ts
        // 팀 기여도도 실패해도 나머지 렌더에 영향 없도록 독립 처리
        api
          .get(`/player/${playerId}/team-impact`)
          .then((res) => setTeamImpact(res.data))
          .catch((e) => {
            console.error("Error fetching team impact:", e);
            setTeamImpact(null);
          });
```
`PlayerDetailClient` 사용부에 prop 전달:
```tsx
      <PlayerDetailClient
        player={player}
        gameRecords={gameRecords}
        allLogItemNames={allLogItemNames}
        ability={ability}
        teamImpact={teamImpact}
        groupPlayers={groupPlayers}
      />
```

- [ ] **Step 2: `PlayerDetailClient.tsx` — prop 추가 + 카드 마운트 + 일자별 행 제거**

import 줄 교체·추가:
```ts
import { GameRecord, GroupPlayer, Player, PlayerAbility, PlayerTeamImpact } from "./types";
import TeamImpactCard from "./TeamImpactCard";
```
props 인터페이스·시그니처에 `teamImpact` 추가:
```ts
interface PlayerDetailClientProps {
  player: Player;
  gameRecords: GameRecord[];
  allLogItemNames: string[];
  ability: PlayerAbility | null;
  teamImpact: PlayerTeamImpact | null;
  groupPlayers: GroupPlayer[];
}

export default function PlayerDetailClient({ player, gameRecords, allLogItemNames, ability, teamImpact, groupPlayers }: PlayerDetailClientProps) {
```
`<ShareButton .../>` 아래, `<S.StatsCard>` **위**에 카드 삽입:
```tsx
      <ShareButton playerId={player.id} />

      <TeamImpactCard impact={teamImpact} />

      <S.StatsCard>
```
표에서 **일자별 행 블록만 삭제**. 아래 JSX(파일의 `{displayRecords.map((record) => ( ... ))}` 전체)를 제거한다. 다른 행(`S.SummaryRow`, `S.AverageRow`)은 유지:
```tsx
              {displayRecords.map((record) => (
                <tr key={record.gameId}>
                  <S.Td isFirst>
                    <S.GameInfo>
                      <S.GameName>{record.gameName}</S.GameName>
                      <S.GameDate>
                        {`${new Date(record.gameDate).getFullYear()}.${String(new Date(record.gameDate).getMonth() + 1).padStart(2, "0")}.${String(
                          new Date(record.gameDate).getDate()
                        ).padStart(2, "0")}`}
                      </S.GameDate>
                    </S.GameInfo>
                  </S.Td>
                  <S.Td>
                    <S.StatValue isPositive={record.totalScore >= 0}>{record.totalScore}점</S.StatValue>
                  </S.Td>
                  {allLogItemNames.map((name) => {
                    const logItem = record.logs.find((log) => log.name === name);
                    const count = logItem?.count || 0;
                    return (
                      <S.Td key={name}>
                        <S.StatValue isPositive={count > 0} isNeutral={count === 0}>
                          {count > 0 ? `${count}회` : "-"}
                        </S.StatValue>
                      </S.Td>
                    );
                  })}
                </tr>
              ))}
```
> `totalStats`/`averageStats`/`displayRecords` 계산 로직과 `전체 기록`·`게임당 평균` 행은 **그대로 둔다**(`displayRecords`는 집계에서 계속 사용됨 → 미사용 경고 없음).

- [ ] **Step 3: 빌드/린트 검증**

Run: `cd frontend && pnpm lint`
Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/app/player/[id]/PlayerDetail.tsx frontend/src/app/player/[id]/PlayerDetailClient.tsx
git commit -m "feat: 선수 상세에 팀 기여도 카드 마운트 및 일자별 기록 행 제거"
```

---

### Task 9: 통합 검증 (수동 스모크)

**Files:** 없음 (검증만)

- [ ] **Step 1: 백엔드 전체 테스트**

Run: `cd backend && pnpm test`
Expected: 신규/기존 스펙 모두 PASS.

- [ ] **Step 2: 로컬 스택 기동**

```bash
docker compose up -d db
cd backend && pnpm dev    # :3010
cd frontend && pnpm dev   # :3011
```

- [ ] **Step 3: 엔드포인트 스모크**

Run: `curl -s http://localhost:3010/player/<완료경기있는선수ID>/team-impact`
Expected: `hasData:true`, `record`/`winRate`/`avgTeamScore`/`contributions`/`ability`/`bestTeammates` 필드가 채워진 JSON.

- [ ] **Step 4: 화면 확인 (수동)**

`http://localhost:3011/player/<id>` 접속 후 확인:
- 팀 기여도 카드가 능력치/공유 버튼 아래·요약 표 위에 렌더된다.
- 승률 게이지, 최근 폼 도트, 득실 타일(마진 부호 색), 기여도 바, 능력 지표, 케미 리스트 표시.
- 요약 표에 `전체 기록`·`게임당 평균` 두 행만 남고 **일자별 행은 없다**.
- 완료 경기가 없는 선수: "완료된 경기가 없어 아직 집계할 수 없습니다" 빈 상태.
- 모바일 폭(≤640px)에서 타일/전적이 세로로 정렬되고 가로 스크롤이 없다.

---

## Self-Review 결과

- **스펙 커버리지**: 표 삭제 범위(Task 8) · 완료 경기 한정(Task 4 쿼리) · 삭제 선수 제외(Task 4 INNER JOIN) · 5개 지표 섹션(전적 Task 1, 득실/접전 Task 1, 기여도 Task 2, 능력/임팩트 Task 2·1, 케미 Task 3) · 엔드포인트(Task 5) · 카드 배치(Task 8) · TDD(Task 1–3·5) 모두 태스크로 매핑됨.
- **플레이스홀더 스캔**: 없음. 모든 코드 스텝에 실제 구현 포함.
- **타입 정합**: `computeTeamImpact` 입력/`PlayerTeamImpact` 응답 형태가 프론트 타입(Task 6)과 동일. 서비스 생성자 4-인자 변경에 따른 기존 능력치 스펙 보정(Task 5 Step 6) 포함. 컴포넌트 import는 Task 7(카드 생성)이 Task 8(마운트)보다 먼저 실행되도록 배치.
