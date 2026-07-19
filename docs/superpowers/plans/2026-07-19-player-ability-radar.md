# Player 능력치 6각 레이더 그래프 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선수 상세 페이지에 그룹 내 상대평가 기반 6각 레이더 능력치 그래프를 추가한다.

**Architecture:** 백엔드에 읽기 전용 집계 API(`GET /player/:id/ability`)를 신설한다. 그룹 전체 로그를 선수×logitem으로 raw 집계하는 얇은 리포지토리, 매핑·백분위·폴백을 담당하는 순수 유틸(단위 테스트 대상), 이를 조합하는 서비스로 분리한다. 프론트는 의존성 없는 순수 SVG `RadarChart`로 결과를 그리기만 한다.

**Tech Stack:** NestJS 11 + TypeORM(QueryBuilder) + PostgreSQL, Jest(백엔드). Next.js 14 App Router + styled-components(프론트, 차트 라이브러리 없음). 패키지 매니저 pnpm.

## Global Constraints

- 백엔드 명령은 `backend/`, 프론트 명령은 `frontend/` 안에서 실행. 패키지 매니저는 **pnpm**.
- 커밋 메시지 제목·본문은 **한글**, 타입 접두어(`feat:`/`fix:`/`docs:`)는 영문. 커밋 말미에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **main 푸시 = 운영 자동 배포.** 이 계획의 커밋은 전부 **로컬 커밋만** 한다. 푸시는 사용자 명시 승인 후에만.
- **FK 제거 정책**: `Log.player`가 null일 수 있다. 집계는 `INNER JOIN log.player`로 삭제 선수 로그를 제외한다(null-safe).
- **삭제 게임 제외**: 모든 집계에 `game.status != 'DELETED'` 적용.
- 백엔드 테스트: `cd backend && pnpm test`. 단일 파일: `pnpm test -- src/path/to/file.spec.ts`.
- 프론트는 컴포넌트 테스트 러너가 없다. 검증은 `cd frontend && pnpm build`(tsc 타입체크 포함) 통과 + 브라우저 수동 스모크.
- Postgres 컬럼은 대소문자 구분(`"playerId"`, `"gameId"`, `"groupId"`, `"createdAt"`). QueryBuilder의 `log.playerId` 표기는 TypeORM이 자동 인용하므로 그대로 사용.
- 응답 필드명은 아래 타입 정의를 **정확히** 따른다(프론트가 그대로 소비).

---

## File Structure

**백엔드 (`backend/src/`)**
- `modules/player/ability.types.ts` — 신규. 공용 타입(`AbilityRow`, `GamesPlayed`, `AbilityAxis`, `PlayerAbility`).
- `modules/player/ability.util.ts` — 신규. 순수 함수: 백분위, 축 매핑, 모드 판정, `computeAbility`.
- `modules/player/ability.util.spec.ts` — 신규. 유틸 단위 테스트.
- `repository/ability.repository.ts` — 신규. `aggregateGroupAbility`, `aggregateGamesPlayed`(얇은 SQL).
- `modules/player/player.service.ts` — 수정. `getPlayerAbility(id)` 추가.
- `modules/player/player.service.ability.spec.ts` — 신규. 서비스 단위 테스트(리포지토리 목).
- `modules/player/player.controller.ts` — 수정. `@Get(':id/ability')` 추가.
- `modules/player/player.module.ts` — 수정. `Log`/`Logitem` forFeature + `AbilityRepository` provider.

**프론트 (`frontend/src/app/player/[id]/`)**
- `types.ts` — 수정. `PlayerAbility`/`AbilityAxis` 타입 추가.
- `RadarChart.tsx` — 신규. 순수 SVG 레이더 컴포넌트.
- `AbilityCard.tsx` — 신규. 카드 래퍼(제목·배지·차트·캡션·폴백).
- `PlayerDetail.tsx` — 수정. ability fetch 추가(독립 처리).
- `PlayerDetailClient.tsx` — 수정. `AbilityCard` 렌더.
- `styles/PlayerDetailStyles.ts` — 수정. 능력치 카드/차트 스타일.

---

## Task 1: 백엔드 능력치 타입 + 백분위 순수 함수

**Files:**
- Create: `backend/src/modules/player/ability.types.ts`
- Create: `backend/src/modules/player/ability.util.ts`
- Test: `backend/src/modules/player/ability.util.spec.ts`

**Interfaces:**
- Consumes: 없음.
- Produces:
  - `interface AbilityRow { playerId: number; name: string; count: number; valueSum: number; }`
  - `interface GamesPlayed { playerId: number; gamesPlayed: number; }`
  - `interface AbilityAxis { key: string; label: string; score: number | null; rawPerGame: number; groupAvgPerGame: number; higherIsBetter: boolean; }`
  - `interface PlayerAbility { playerId: number; groupId: number; mode: 'basketball' | 'dynamic'; gamesPlayed: number; groupSize: number; hasData: boolean; axes: AbilityAxis[]; }`
  - `function percentileRank(values: number[], target: number, higherIsBetter: boolean): number`

- [ ] **Step 1: 타입 파일 작성**

`backend/src/modules/player/ability.types.ts`:

```ts
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
```

- [ ] **Step 2: 백분위 실패 테스트 작성**

`backend/src/modules/player/ability.util.spec.ts`:

```ts
import { percentileRank } from './ability.util';

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
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd backend && pnpm test -- src/modules/player/ability.util.spec.ts`
Expected: FAIL — `percentileRank`가 정의되지 않음.

- [ ] **Step 4: 백분위 함수 구현**

`backend/src/modules/player/ability.util.ts`:

```ts
import { AbilityRow, GamesPlayed, PlayerAbility } from './ability.types';

// 표준 percentile rank. 동점은 절반 가산해 극단값이 0/100에 몰리지 않게 한다.
export function percentileRank(
  values: number[],
  target: number,
  higherIsBetter: boolean,
): number {
  const n = values.length;
  if (n === 0) return 0;
  const below = values.filter((v) =>
    higherIsBetter ? v < target : v > target,
  ).length;
  const ties = values.filter((v) => v === target).length;
  return Math.round((100 * (below + 0.5 * ties)) / n);
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd backend && pnpm test -- src/modules/player/ability.util.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: 커밋**

```bash
git add backend/src/modules/player/ability.types.ts backend/src/modules/player/ability.util.ts backend/src/modules/player/ability.util.spec.ts
git commit -m "feat: 능력치 타입과 백분위 순수 함수 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 농구 6축 매핑 + computeAbility (basketball 모드)

**Files:**
- Modify: `backend/src/modules/player/ability.util.ts`
- Test: `backend/src/modules/player/ability.util.spec.ts`

**Interfaces:**
- Consumes: `percentileRank`, `AbilityRow`, `GamesPlayed`, `PlayerAbility` (Task 1).
- Produces: `function computeAbility(input: { rows: AbilityRow[]; gamesPlayed: GamesPlayed[]; targetPlayerId: number; groupId: number; }): PlayerAbility`

- [ ] **Step 1: 실패 테스트 작성 (basketball 모드)**

`ability.util.spec.ts`에 추가:

```ts
import { computeAbility } from './ability.util';
import { AbilityRow, GamesPlayed } from './ability.types';

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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pnpm test -- src/modules/player/ability.util.spec.ts`
Expected: FAIL — `computeAbility` 미정의.

- [ ] **Step 3: 농구 축 정의 + computeAbility 구현**

`ability.util.ts`에 추가(파일 하단):

```ts
interface AxisDef {
  key: string;
  label: string;
  higherIsBetter: boolean;
  // 선수 한 명의 rows에서 이 축의 raw 총량을 계산
  raw: (rows: AbilityRow[]) => number;
  // 그룹 전체에서 이 축으로 매핑되는 이름이 존재하는지
  present: (names: Set<string>) => boolean;
}

const sumCount = (rows: AbilityRow[], match: (n: string) => boolean) =>
  rows.filter((r) => match(r.name)).reduce((s, r) => s + r.count, 0);

const BASKETBALL_AXES: AxisDef[] = [
  {
    key: 'scoring', label: '득점력', higherIsBetter: true,
    raw: (rows) => rows.reduce((s, r) => s + r.valueSum, 0),
    present: (names) => [...names].some((n) => n.includes('3점') || n.includes('2점') || n.includes('자유투')),
  },
  {
    key: 'outside', label: '외곽', higherIsBetter: true,
    raw: (rows) => sumCount(rows, (n) => n.includes('3점')),
    present: (names) => [...names].some((n) => n.includes('3점')),
  },
  {
    key: 'assist', label: '어시스트', higherIsBetter: true,
    raw: (rows) => sumCount(rows, (n) => n.includes('어시')),
    present: (names) => [...names].some((n) => n.includes('어시')),
  },
  {
    key: 'rebound', label: '리바운드', higherIsBetter: true,
    raw: (rows) => sumCount(rows, (n) => n.includes('리바')),
    present: (names) => [...names].some((n) => n.includes('리바')),
  },
  {
    key: 'defense', label: '수비', higherIsBetter: true,
    raw: (rows) => sumCount(rows, (n) => n.includes('스틸') || n.includes('블록')),
    present: (names) => [...names].some((n) => n.includes('스틸') || n.includes('블록')),
  },
  {
    key: 'stability', label: '안정성', higherIsBetter: false,
    raw: (rows) => sumCount(rows, (n) => n.includes('턴오버') || n.includes('파울')),
    present: (names) => [...names].some((n) => n.includes('턴오버') || n.includes('파울')),
  },
];

interface ComputeInput {
  rows: AbilityRow[];
  gamesPlayed: GamesPlayed[];
  targetPlayerId: number;
  groupId: number;
}

export function computeAbility(input: ComputeInput): PlayerAbility {
  const { rows, gamesPlayed, targetPlayerId, groupId } = input;

  const gamesByPlayer = new Map<number, number>();
  gamesPlayed.forEach((g) => gamesByPlayer.set(g.playerId, g.gamesPlayed));

  const rowsByPlayer = new Map<number, AbilityRow[]>();
  rows.forEach((r) => {
    const list = rowsByPlayer.get(r.playerId) ?? [];
    list.push(r);
    rowsByPlayer.set(r.playerId, list);
  });

  // 모집단: 1게임 이상 참여한 선수
  const poolIds = [...gamesByPlayer.keys()].filter(
    (pid) => (gamesByPlayer.get(pid) ?? 0) >= 1,
  );
  const groupSize = poolIds.length;

  const names = new Set(rows.map((r) => r.name));
  const axisDefs = pickAxes(rows, names);

  const targetGames = gamesByPlayer.get(targetPlayerId) ?? 0;
  const hasData = targetGames > 0 && groupSize > 0;

  const axes = axisDefs.map((def) => {
    const perGame = (pid: number) => {
      const g = gamesByPlayer.get(pid) ?? 0;
      if (g === 0) return 0;
      return def.raw(rowsByPlayer.get(pid) ?? []) / g;
    };
    const targetRaw = hasData ? perGame(targetPlayerId) : 0;
    const distribution = poolIds.map(perGame);
    const groupAvg = distribution.length
      ? distribution.reduce((s, v) => s + v, 0) / distribution.length
      : 0;
    const score =
      hasData && groupSize > 1
        ? percentileRank(distribution, targetRaw, def.higherIsBetter)
        : null;
    return {
      key: def.key,
      label: def.label,
      score,
      rawPerGame: round1(targetRaw),
      groupAvgPerGame: round1(groupAvg),
      higherIsBetter: def.higherIsBetter,
    };
  });

  return {
    playerId: targetPlayerId,
    groupId,
    mode: axisDefs === BASKETBALL_AXES ? 'basketball' : 'dynamic',
    gamesPlayed: targetGames,
    groupSize,
    hasData,
    axes,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Task 3에서 동적 폴백을 추가한다. 지금은 농구 축만 반환.
function pickAxes(_rows: AbilityRow[], _names: Set<string>): AxisDef[] {
  return BASKETBALL_AXES;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && pnpm test -- src/modules/player/ability.util.spec.ts`
Expected: PASS (Task 1 + Task 2 테스트 전부).

- [ ] **Step 5: 커밋**

```bash
git add backend/src/modules/player/ability.util.ts backend/src/modules/player/ability.util.spec.ts
git commit -m "feat: 농구 6축 매핑과 computeAbility(basketball) 구현

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 동적 폴백 (커스텀 그룹)

**Files:**
- Modify: `backend/src/modules/player/ability.util.ts`
- Test: `backend/src/modules/player/ability.util.spec.ts`

**Interfaces:**
- Consumes: Task 2의 `AxisDef`, `BASKETBALL_AXES`, `computeAbility`.
- Produces: `pickAxes`가 매핑 4축 미만이면 사용빈도 상위 logitem 기반 동적 축(최대 6, 최소 3)을 반환. 3축 미만이면 빈 배열 → `hasData=false`.

- [ ] **Step 1: 실패 테스트 작성**

`ability.util.spec.ts`에 추가:

```ts
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
    expect(a.axes.map((x) => x.label)).toEqual(['펀치', '킥', '방어', '클린치']);
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pnpm test -- src/modules/player/ability.util.spec.ts`
Expected: FAIL — 현재 `pickAxes`는 항상 농구 축 반환.

- [ ] **Step 3: pickAxes에 동적 폴백 구현**

`ability.util.ts`의 `pickAxes`를 교체하고 헬퍼 추가:

```ts
function pickAxes(rows: AbilityRow[], names: Set<string>): AxisDef[] {
  const mappable = BASKETBALL_AXES.filter((def) => def.present(names)).length;
  if (mappable >= 4) return BASKETBALL_AXES;
  return buildDynamicAxes(rows);
}

function buildDynamicAxes(rows: AbilityRow[]): AxisDef[] {
  const countByName = new Map<string, number>();
  rows.forEach((r) =>
    countByName.set(r.name, (countByName.get(r.name) ?? 0) + r.count),
  );
  const topNames = [...countByName.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name]) => name);
  if (topNames.length < 3) return [];
  return topNames.map((name) => ({
    key: `dyn_${name}`,
    label: name,
    higherIsBetter: true,
    raw: (rs: AbilityRow[]) => sumCount(rs, (n) => n === name),
    present: () => true,
  }));
}
```

`computeAbility`의 `mode` 판정을 참조 비교에서 결과 기반으로 바꾼다(동적 축도 배열이 새로 생성되므로 `=== BASKETBALL_AXES`가 유효하다 — 농구일 때만 그 상수를 그대로 반환하기 때문). 확인만 하고 변경 불필요.

`hasData`는 `axisDefs.length === 0`이면 false여야 한다. `computeAbility`의 `hasData` 계산을 아래로 수정:

```ts
  const hasData = targetGames > 0 && groupSize > 0 && axisDefs.length > 0;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && pnpm test -- src/modules/player/ability.util.spec.ts`
Expected: PASS (Task 1~3 전부).

- [ ] **Step 5: 커밋**

```bash
git add backend/src/modules/player/ability.util.ts backend/src/modules/player/ability.util.spec.ts
git commit -m "feat: 커스텀 그룹용 동적 축 폴백 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 집계 리포지토리 (얇은 SQL)

**Files:**
- Create: `backend/src/repository/ability.repository.ts`
- Modify: `backend/src/modules/player/player.module.ts`

**Interfaces:**
- Consumes: `AbilityRow`, `GamesPlayed` (Task 1), `Log` 엔티티.
- Produces:
  - `class AbilityRepository`
  - `aggregateGroupAbility(groupId: number): Promise<AbilityRow[]>`
  - `aggregateGamesPlayed(groupId: number): Promise<GamesPlayed[]>`

> 이 리포지토리는 얇은 SQL 래퍼다. 단위 테스트는 목이 어렵고 값이 낮으므로 두지 않는다(순수 로직은 Task 1~3, 조합은 Task 5에서 목으로 검증). Task 7 수동 스모크에서 실제 DB로 확인한다.

- [ ] **Step 1: 리포지토리 작성**

`backend/src/repository/ability.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Log } from 'src/entities/Log.entity';
import { AbilityRow, GamesPlayed } from 'src/modules/player/ability.types';

@Injectable()
export class AbilityRepository {
  constructor(
    @InjectRepository(Log)
    private readonly logRepository: Repository<Log>,
  ) {}

  // 그룹 전체를 (선수 x logitem 이름)으로 집계. 삭제 게임/삭제 선수 제외.
  async aggregateGroupAbility(groupId: number): Promise<AbilityRow[]> {
    const rows = await this.logRepository
      .createQueryBuilder('log')
      .innerJoin('log.logitem', 'logitem')
      .innerJoin('log.game', 'game')
      .innerJoin('log.player', 'player') // FK 제거 정책: INNER JOIN으로 삭제 선수 로그 제외
      .select('log.playerId', 'playerId')
      .addSelect('logitem.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(logitem.value)', 'valueSum')
      .where('log.groupId = :groupId', { groupId })
      .andWhere("game.status != 'DELETED'")
      .groupBy('log.playerId')
      .addGroupBy('logitem.name')
      .getRawMany();

    return rows.map((r) => ({
      playerId: Number(r.playerId),
      name: r.name,
      count: Number(r.count),
      valueSum: Number(r.valueSum),
    }));
  }

  // 선수별 참여(로그 존재) 게임 수. 삭제 게임/삭제 선수 제외.
  async aggregateGamesPlayed(groupId: number): Promise<GamesPlayed[]> {
    const rows = await this.logRepository
      .createQueryBuilder('log')
      .innerJoin('log.game', 'game')
      .innerJoin('log.player', 'player')
      .select('log.playerId', 'playerId')
      .addSelect('COUNT(DISTINCT log.gameId)', 'gamesPlayed')
      .where('log.groupId = :groupId', { groupId })
      .andWhere("game.status != 'DELETED'")
      .groupBy('log.playerId')
      .getRawMany();

    return rows.map((r) => ({
      playerId: Number(r.playerId),
      gamesPlayed: Number(r.gamesPlayed),
    }));
  }
}
```

- [ ] **Step 2: 모듈 배선**

`backend/src/modules/player/player.module.ts`를 수정 — `Log`, `Logitem` 엔티티를 forFeature에 추가하고 `AbilityRepository`를 provider로 등록:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Game } from 'src/entities/Game.entity';
import { Group } from 'src/entities/Group.entity';
import { Player } from 'src/entities/Player.entity';
import { Log } from 'src/entities/Log.entity';
import { Logitem } from 'src/entities/Logitem.entity';
import { PlayerService } from './player.service';
import { PlayerController } from './player.controller';
import { PlayerRepository } from 'src/repository/player.repository';
import { InGamePlayersRepository } from 'src/repository/inGamePlayers.repository';
import { AbilityRepository } from 'src/repository/ability.repository';
import { InGamePlayer } from 'src/entities/InGamePlayer.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([Game, Player, Group, InGamePlayer, Log, Logitem]),
  ],
  controllers: [PlayerController],
  providers: [
    PlayerService,
    PlayerRepository,
    InGamePlayersRepository,
    AbilityRepository,
  ],
})
export class PlayerModule {}
```

- [ ] **Step 3: 빌드로 배선 검증**

Run: `cd backend && pnpm build`
Expected: 성공(타입/의존성 오류 없음).

- [ ] **Step 4: 커밋**

```bash
git add backend/src/repository/ability.repository.ts backend/src/modules/player/player.module.ts
git commit -m "feat: 능력치 그룹 집계 리포지토리 추가 및 모듈 배선

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 서비스 오케스트레이션 + 컨트롤러 라우트

**Files:**
- Modify: `backend/src/modules/player/player.service.ts`
- Modify: `backend/src/modules/player/player.controller.ts`
- Test: `backend/src/modules/player/player.service.ability.spec.ts`

**Interfaces:**
- Consumes: `AbilityRepository`(Task 4), `computeAbility`(Task 2), `PlayerRepository.findById`.
- Produces:
  - `PlayerService.getPlayerAbility(id: number): Promise<PlayerAbility>`
  - `GET /player/:id/ability` → `PlayerAbility`

- [ ] **Step 1: 서비스 실패 테스트 작성**

`backend/src/modules/player/player.service.ability.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { PlayerService } from './player.service';

describe('PlayerService.getPlayerAbility', () => {
  const makeService = (overrides: any = {}) => {
    const playerRepository = {
      findById: jest.fn().mockResolvedValue({ id: 1, groupId: 7 }),
      ...overrides.playerRepository,
    };
    const abilityRepository = {
      aggregateGroupAbility: jest.fn().mockResolvedValue([
        { playerId: 1, name: '3점', count: 2, valueSum: 6 },
        { playerId: 1, name: '어시', count: 4, valueSum: 0 },
        { playerId: 1, name: '리바', count: 2, valueSum: 0 },
        { playerId: 1, name: '스틸', count: 1, valueSum: 0 },
        { playerId: 1, name: '턴오버', count: 1, valueSum: 0 },
        { playerId: 2, name: '리바', count: 6, valueSum: 0 },
      ]),
      aggregateGamesPlayed: jest.fn().mockResolvedValue([
        { playerId: 1, gamesPlayed: 2 },
        { playerId: 2, gamesPlayed: 2 },
      ]),
      ...overrides.abilityRepository,
    };
    const service = new PlayerService(
      playerRepository as any,
      {} as any, // inGamePlayersRepository (미사용)
      abilityRepository as any,
    );
    return { service, playerRepository, abilityRepository };
  };

  it('선수 그룹으로 능력치를 집계해 반환', async () => {
    const { service, abilityRepository } = makeService();
    const result = await service.getPlayerAbility(1);
    expect(abilityRepository.aggregateGroupAbility).toHaveBeenCalledWith(7);
    expect(result.playerId).toBe(1);
    expect(result.groupId).toBe(7);
    expect(result.axes.length).toBeGreaterThanOrEqual(3);
  });

  it('선수가 없으면 404', async () => {
    const { service } = makeService({
      playerRepository: { findById: jest.fn().mockResolvedValue(null) },
    });
    await expect(service.getPlayerAbility(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
```

> 주의: 테스트의 `PlayerService` 생성자 인자 순서는 Step 3에서 정하는 순서와 반드시 일치해야 한다: `(playerRepository, inGamePlayersRepository, abilityRepository)`.

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pnpm test -- src/modules/player/player.service.ability.spec.ts`
Expected: FAIL — `getPlayerAbility` 미정의 / 생성자 인자 불일치.

- [ ] **Step 3: 서비스 구현**

`backend/src/modules/player/player.service.ts` 수정 — import 추가, 생성자에 `AbilityRepository` 주입, 메서드 추가:

```ts
// 상단 import에 추가
import { AbilityRepository } from 'src/repository/ability.repository';
import { computeAbility } from './ability.util';
import { PlayerAbility } from './ability.types';
```

생성자 수정(기존 두 인자 뒤에 추가):

```ts
  constructor(
    private readonly playerRepository: PlayerRepository,
    private readonly inGamePlayersRepository: InGamePlayersRepository,
    private readonly abilityRepository: AbilityRepository,
  ) {}
```

클래스에 메서드 추가:

```ts
  async getPlayerAbility(id: number): Promise<PlayerAbility> {
    const player = await this.playerRepository.findById(id);
    if (!player) {
      throw new NotFoundException('선수를 찾을 수 없습니다.');
    }
    const groupId = player.groupId;
    const [rows, gamesPlayed] = await Promise.all([
      this.abilityRepository.aggregateGroupAbility(groupId),
      this.abilityRepository.aggregateGamesPlayed(groupId),
    ]);
    return computeAbility({ rows, gamesPlayed, targetPlayerId: id, groupId });
  }
```

- [ ] **Step 4: 서비스 테스트 통과 확인**

Run: `cd backend && pnpm test -- src/modules/player/player.service.ability.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: 컨트롤러 라우트 추가**

`backend/src/modules/player/player.controller.ts`의 `getPlayerByPlayerId`(`@Get(':id')`) 바로 아래에 추가:

```ts
  @Get(':id/ability')
  async getPlayerAbility(@Param('id') id: number) {
    return this.playerService.getPlayerAbility(id);
  }
```

- [ ] **Step 6: 전체 백엔드 테스트 + 빌드**

Run: `cd backend && pnpm test && pnpm build`
Expected: 전체 스위트 PASS(기존 포함), 빌드 성공.

- [ ] **Step 7: 커밋**

```bash
git add backend/src/modules/player/player.service.ts backend/src/modules/player/player.controller.ts backend/src/modules/player/player.service.ability.spec.ts
git commit -m "feat: player 능력치 API(GET /player/:id/ability) 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 백엔드 실 DB 스모크 (로컬)

**Files:** 없음(검증 전용).

- [ ] **Step 1: 로컬 스택 기동 확인**

Run(각각 별 터미널 또는 이미 기동 중이면 생략):
```bash
docker compose up -d db
cd backend && pnpm dev
```
Expected: `:3010` 부팅, 에러 없음.

- [ ] **Step 2: 존재하는 선수 id 확인**

Run:
```bash
docker exec -e PGPASSWORD=$(grep DB_PASSWORD /Users/onady/project/dngg/.env | cut -d= -f2) postgres \
  psql -U postgres -d dngg -c 'SELECT id, name, "groupId" FROM player ORDER BY id LIMIT 5;'
```
Expected: 선수 id 목록.

- [ ] **Step 3: 능력치 API 호출**

Run(위에서 얻은 실제 id로 치환):
```bash
curl -s http://localhost:3010/player/<ID>/ability | python3 -m json.tool
```
Expected: `mode`, `gamesPlayed`, `groupSize`, `hasData`, `axes[]`(각 축 `key/label/score/rawPerGame`)가 채워진 JSON. 농구 그룹이면 `mode: "basketball"`, 6축. `score`는 0~100 또는 null.

- [ ] **Step 4: 결과 육안 검증**

- `hasData: true`인 선수에서 `axes[].score`가 0~100 범위인지, `rawPerGame`이 테이블의 게임당 평균과 대략 일치하는지 확인.
- 기록 없는 선수 id로 호출 시 `hasData: false`, 모든 `score: null` 확인.
- 검증만 하는 단계라 커밋 없음. 문제 발견 시 해당 Task로 돌아가 수정.

---

## Task 7: 프론트 능력치 타입 추가

**Files:**
- Modify: `frontend/src/app/player/[id]/types.ts`

**Interfaces:**
- Produces: `AbilityAxis`, `PlayerAbility` (백엔드 응답과 동일 형태).

- [ ] **Step 1: 타입 추가**

`frontend/src/app/player/[id]/types.ts` 하단에 추가:

```ts
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
```

- [ ] **Step 2: 타입체크**

Run: `cd frontend && pnpm build`
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/app/player/[id]/types.ts
git commit -m "feat: 프론트 능력치 응답 타입 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: RadarChart SVG 컴포넌트

**Files:**
- Create: `frontend/src/app/player/[id]/RadarChart.tsx`

**Interfaces:**
- Consumes: 없음(프레젠테이션 전용).
- Produces: `export default function RadarChart(props: { axes: { label: string; value: number }[]; size?: number })` — `value`는 0~100. 3~6축 지원.

- [ ] **Step 1: 컴포넌트 작성**

`frontend/src/app/player/[id]/RadarChart.tsx`:

```tsx
"use client";

import React from "react";

interface RadarAxis {
  label: string;
  value: number; // 0~100
}

interface RadarChartProps {
  axes: RadarAxis[];
  size?: number;
}

const ACCENT = "#2563eb";
const GRID = "#e2e8f0";
const TEXT = "#475569";

export default function RadarChart({ axes, size = 280 }: RadarChartProps) {
  const n = axes.length;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.32; // 라벨 여백 확보

  // i번째 축의 각도(12시 방향 시작, 시계방향)
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const point = (i: number, frac: number) => {
    const a = angle(i);
    return [cx + radius * frac * Math.cos(a), cy + radius * frac * Math.sin(a)];
  };

  const rings = [0.25, 0.5, 0.75, 1];
  const gridPolys = rings.map((r) =>
    axes.map((_, i) => point(i, r).join(",")).join(" "),
  );
  const dataPoly = axes
    .map((ax, i) => point(i, Math.max(0, Math.min(100, ax.value)) / 100).join(","))
    .join(" ");

  const ariaLabel = axes
    .map((ax) => `${ax.label} ${Math.round(ax.value)}`)
    .join(", ");

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ maxWidth: size, display: "block", margin: "0 auto" }}
      role="img"
      aria-label={`능력치: ${ariaLabel}`}
    >
      {/* 그리드 */}
      {gridPolys.map((pts, idx) => (
        <polygon key={idx} points={pts} fill="none" stroke={GRID} strokeWidth={1} />
      ))}
      {/* 축선 */}
      {axes.map((_, i) => {
        const [x, y] = point(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={GRID} strokeWidth={1} />;
      })}
      {/* 데이터 폴리곤 */}
      <polygon
        points={dataPoly}
        fill={ACCENT}
        fillOpacity={0.25}
        stroke={ACCENT}
        strokeWidth={2}
      />
      {axes.map((ax, i) => {
        const [x, y] = point(i, Math.max(0, Math.min(100, ax.value)) / 100);
        return <circle key={i} cx={x} cy={y} r={3} fill={ACCENT} />;
      })}
      {/* 라벨 + 점수 */}
      {axes.map((ax, i) => {
        const [lx, ly] = point(i, 1.18);
        const anchor = Math.abs(lx - cx) < 1 ? "middle" : lx > cx ? "start" : "end";
        return (
          <text
            key={i}
            x={lx}
            y={ly}
            textAnchor={anchor}
            dominantBaseline="middle"
            fontSize={12}
            fill={TEXT}
          >
            <tspan fontWeight={600}>{ax.label}</tspan>
            <tspan x={lx} dy={14} fill={ACCENT} fontWeight={700}>
              {Math.round(ax.value)}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `cd frontend && pnpm build`
Expected: 성공(아직 미사용이지만 컴파일되어야 함).

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/app/player/[id]/RadarChart.tsx
git commit -m "feat: 순수 SVG 레이더 차트 컴포넌트 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: AbilityCard + 페이지 통합

**Files:**
- Create: `frontend/src/app/player/[id]/AbilityCard.tsx`
- Modify: `frontend/src/app/player/[id]/styles/PlayerDetailStyles.ts`
- Modify: `frontend/src/app/player/[id]/PlayerDetail.tsx`
- Modify: `frontend/src/app/player/[id]/PlayerDetailClient.tsx`

**Interfaces:**
- Consumes: `RadarChart`(Task 8), `PlayerAbility`(Task 7).
- Produces: `export default function AbilityCard(props: { ability: PlayerAbility | null })`. `PlayerDetailClient`가 `ability` prop을 받아 렌더.

- [ ] **Step 1: 카드 스타일 추가**

`frontend/src/app/player/[id]/styles/PlayerDetailStyles.ts` 하단에 추가:

```ts
export const AbilityCardWrap = styled.div`
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

export const AbilityHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
`;

export const AbilityTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  color: #1e293b;
`;

export const AbilityModeBadge = styled.span`
  padding: 0.125rem 0.5rem;
  background-color: #eff6ff;
  color: #1d4ed8;
  border-radius: 1rem;
  font-size: 0.75rem;
  font-weight: 600;
`;

export const AbilityCaption = styled.p`
  margin-top: 0.5rem;
  font-size: 0.8125rem;
  color: #94a3b8;
  text-align: center;
`;

export const AbilityEmpty = styled.p`
  padding: 2rem 1rem;
  text-align: center;
  color: #94a3b8;
  font-size: 0.9375rem;
`;

export const AbilityRawList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-top: 0.5rem;

  li {
    display: flex;
    justify-content: space-between;
    font-size: 0.875rem;
    color: #475569;
    border-bottom: 1px solid #f1f5f9;
    padding-bottom: 0.375rem;
  }
  li span:last-child {
    font-weight: 600;
    color: #1e293b;
  }
`;
```

- [ ] **Step 2: AbilityCard 작성**

`frontend/src/app/player/[id]/AbilityCard.tsx`:

```tsx
"use client";

import React from "react";
import RadarChart from "./RadarChart";
import { PlayerAbility } from "./types";
import * as S from "./styles/PlayerDetailStyles";

interface AbilityCardProps {
  ability: PlayerAbility | null;
}

export default function AbilityCard({ ability }: AbilityCardProps) {
  if (!ability) return null;

  const modeLabel = ability.mode === "basketball" ? "농구" : "커스텀";

  if (!ability.hasData) {
    return (
      <S.AbilityCardWrap>
        <S.AbilityHeader>
          <S.AbilityTitle>능력치</S.AbilityTitle>
        </S.AbilityHeader>
        <S.AbilityEmpty>능력치를 계산할 기록이 부족합니다.</S.AbilityEmpty>
      </S.AbilityCardWrap>
    );
  }

  // 모집단이 1명 이하면 백분위(score)가 null → 원값 목록으로 폴백
  const scored = ability.axes.every((a) => a.score !== null);

  return (
    <S.AbilityCardWrap>
      <S.AbilityHeader>
        <S.AbilityTitle>능력치</S.AbilityTitle>
        <S.AbilityModeBadge>{modeLabel}</S.AbilityModeBadge>
      </S.AbilityHeader>

      {scored ? (
        <>
          <RadarChart
            axes={ability.axes.map((a) => ({ label: a.label, value: a.score as number }))}
          />
          <S.AbilityCaption>
            그룹 내 상대평가 (상위 백분위, 표본 {ability.gamesPlayed}경기
            {ability.gamesPlayed < 3 ? " · 참고용" : ""})
          </S.AbilityCaption>
        </>
      ) : (
        <>
          <S.AbilityRawList>
            {ability.axes.map((a) => (
              <li key={a.key}>
                <span>{a.label}</span>
                <span>{a.rawPerGame} / 게임</span>
              </li>
            ))}
          </S.AbilityRawList>
          <S.AbilityCaption>
            비교 대상 선수가 부족해 원값(게임당 평균)만 표시합니다.
          </S.AbilityCaption>
        </>
      )}
    </S.AbilityCardWrap>
  );
}
```

- [ ] **Step 3: PlayerDetail에서 ability fetch (독립 처리)**

`frontend/src/app/player/[id]/PlayerDetail.tsx` 수정:

3-1. import에 타입 추가:
```tsx
import { GameRecord, PlayerAbility } from "./types";
```

3-2. state 추가(`allLogItemNames` state 아래):
```tsx
  const [ability, setAbility] = useState<PlayerAbility | null>(null);
```

3-3. 기존 `Promise.all` **아래**에 별도 fetch 추가(실패해도 페이지 나머지에 영향 없게 독립). `setAllLogItemNames(logItemNames);` 다음 줄에:
```tsx
        // 능력치는 실패해도 나머지 렌더에 영향 없도록 독립 처리
        api
          .get(`/player/${playerId}/ability`)
          .then((res) => setAbility(res.data))
          .catch((e) => {
            console.error("Error fetching ability:", e);
            setAbility(null);
          });
```

3-4. `PlayerDetailClient`에 prop 전달:
```tsx
      <PlayerDetailClient 
        player={player} 
        gameRecords={gameRecords} 
        allLogItemNames={allLogItemNames} 
        ability={ability}
      />
```

- [ ] **Step 4: PlayerDetailClient에서 렌더**

`frontend/src/app/player/[id]/PlayerDetailClient.tsx` 수정:

4-1. import:
```tsx
import { GameRecord, Player, PlayerAbility } from "./types";
import AbilityCard from "./AbilityCard";
```

4-2. props 인터페이스에 추가:
```tsx
interface PlayerDetailClientProps {
  player: Player;
  gameRecords: GameRecord[];
  allLogItemNames: string[];
  ability: PlayerAbility | null;
}
```

4-3. 구조분해에 `ability` 추가:
```tsx
export default function PlayerDetailClient({ player, gameRecords, allLogItemNames, ability }: PlayerDetailClientProps) {
```

4-4. `</S.PlayerInfoCard>` 바로 아래(StatsCard 위)에 카드 삽입:
```tsx
      </S.PlayerInfoCard>

      <AbilityCard ability={ability} />

      <S.StatsCard>
```

- [ ] **Step 5: 빌드(타입체크)**

Run: `cd frontend && pnpm build`
Expected: 성공.

- [ ] **Step 6: 브라우저 수동 스모크**

Run(미기동 시): `cd frontend && pnpm dev`
그리고 브라우저에서 `http://localhost:3011/player/<기록있는ID>` 접속.
Expected:
- PlayerInfoCard 아래에 "능력치" 카드 + 6각 레이더가 표시된다.
- 각 꼭짓점에 라벨 + 점수(0~100)가 보인다.
- 기록 없는 선수는 "능력치를 계산할 기록이 부족합니다." 표시.
- 브라우저 콘솔에 치명적 에러 없음. 기존 기록 테이블은 그대로 정상.

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/app/player/[id]/AbilityCard.tsx frontend/src/app/player/[id]/styles/PlayerDetailStyles.ts frontend/src/app/player/[id]/PlayerDetail.tsx frontend/src/app/player/[id]/PlayerDetailClient.tsx
git commit -m "feat: 선수 상세에 능력치 6각 레이더 카드 통합

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: 최종 검증

**Files:** 없음(검증 전용).

- [ ] **Step 1: 백엔드 전체 테스트**

Run: `cd backend && pnpm test`
Expected: 전체 스위트 PASS(신규 ability 테스트 + 기존 회귀 없음).

- [ ] **Step 2: 백엔드/프론트 빌드**

Run: `cd backend && pnpm build && cd ../frontend && pnpm build`
Expected: 둘 다 성공.

- [ ] **Step 3: 엔드투엔드 육안 확인**

- 농구 그룹 선수: 레이더 6축 정상.
- (가능하면) 커스텀 그룹 선수: `mode: dynamic`, 상위 logitem 축 표시.
- 단독 표본/기록 없음 케이스의 폴백 UI 확인.

> 배포는 하지 않는다. main 푸시 = 운영 배포이므로 사용자 승인 후 별도로 진행.

---

## Self-Review 결과

- **Spec coverage**: 엔드포인트(Task 5) · 응답 스키마(Task 1, 7) · 집계 로직/삭제제외/null 선수(Task 4) · 농구 6축(Task 2) · 동적 폴백(Task 3) · 백분위/역산/단독표본(Task 1~2) · 프론트 SVG(Task 8) · 카드/엣지 UX(Task 9) · 테스트(Task 1~5) — 스펙 각 절에 대응 태스크 존재.
- **Placeholder scan**: TBD/TODO 없음. 모든 코드 스텝에 실제 코드 포함.
- **Type consistency**: `PlayerAbility`/`AbilityAxis`/`AbilityRow`/`GamesPlayed` 필드명이 백엔드(Task 1)·프론트(Task 7)·서비스 목(Task 5)·리포지토리(Task 4) 전반에서 일치. `computeAbility` 입력 `{ rows, gamesPlayed, targetPlayerId, groupId }`가 Task 2 정의와 Task 5 호출에서 동일. `PlayerService` 생성자 인자 순서 `(playerRepository, inGamePlayersRepository, abilityRepository)`가 Task 5 목/구현에서 일치.
