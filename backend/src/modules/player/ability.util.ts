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
