import {
  GameRow,
  TeamAggRow,
  SelfAggRow,
  RosterRow,
  ContributionShare,
  PlayerTeamImpact,
  TeammateChemistry,
} from './team-impact.types';

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

export function computeRecord(results: GameResult[]): { wins: number; draws: number; losses: number } {
  let wins = 0, draws = 0, losses = 0;
  results.forEach((r) => {
    if (r.result === 'W') wins++;
    else if (r.result === 'D') draws++;
    else losses++;
  });
  return { wins, draws, losses };
}

export function computeAverages(results: GameResult[]): { avgTeamScore: number; avgOpponentScore: number; avgMargin: number } {
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

export function computeClutch(results: GameResult[]): { games: number; wins: number; draws: number; losses: number; winRate: number | null } {
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

export function computeStreak(results: GameResult[]): { current: number; currentType: Result | null; best: number } {
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

export function computeImpact(results: GameResult[]): { avgPointsInWins: number | null; avgPointsInLosses: number | null } {
  const avg = (arr: GameResult[]) =>
    arr.length ? round1(arr.reduce((s, r) => s + r.myPoints, 0) / arr.length) : null;
  return {
    avgPointsInWins: avg(results.filter((r) => r.result === 'W')),
    avgPointsInLosses: avg(results.filter((r) => r.result === 'L')),
  };
}

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

export function computeAbility(
  selfAgg: SelfAggRow[],
  finishedGames: number,
): { effPerGame: number; astToRatio: number | null; astCount: number; toCount: number } {
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
