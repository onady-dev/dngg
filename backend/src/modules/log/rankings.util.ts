import {
  RankingAggRow,
  RankingGamesPlayed,
  RankingItem,
  RankingPlayer,
  RankingsResponse,
} from './rankings.types';

// 득점 종합 항목의 가상 id (실제 logitem이 아니다)
const SCORING_ITEM_ID = -1;
const SCORING_ITEM_NAME = '득점';

// 랭킹 목록에 노출하지 않는 항목. 득점 종합에는 포함된다.
const isHiddenItem = (name: string) => name.includes('자유투');

const perGame = (total: number, gamesPlayed: number) =>
  gamesPlayed > 0 ? total / gamesPlayed : 0;

interface ComputeInput {
  rows: RankingAggRow[];
  gamesPlayed: RankingGamesPlayed[];
}

export function computeRankings(input: ComputeInput): RankingsResponse {
  const { rows, gamesPlayed } = input;

  const gamesByPlayer = new Map<number, number>();
  gamesPlayed.forEach((g) => gamesByPlayer.set(g.playerId, g.gamesPlayed));

  // 1) 항목별 랭킹 (숨김 항목 제외)
  const itemsById = new Map<number, RankingItem>();
  rows.forEach((r) => {
    if (isHiddenItem(r.logitemName)) return;

    let item = itemsById.get(r.logitemId);
    if (!item) {
      item = {
        id: r.logitemId,
        name: r.logitemName,
        value: r.logitemValue,
        players: [],
      };
      itemsById.set(r.logitemId, item);
    }
    const games = gamesByPlayer.get(r.playerId) ?? 0;
    item.players.push({
      playerId: r.playerId,
      playerName: r.playerName,
      number: r.backnumber,
      totalCount: r.count,
      avgPerGame: perGame(r.count, games),
      gamesPlayed: games,
    });
  });

  // 2) 득점 종합 — 숨김 항목(자유투)을 포함한 전체 valueSum
  const scoreByPlayer = new Map<
    number,
    { name: string; number: string | null; score: number }
  >();
  rows.forEach((r) => {
    const entry = scoreByPlayer.get(r.playerId) ?? {
      name: r.playerName,
      number: r.backnumber,
      score: 0,
    };
    entry.score += r.valueSum;
    scoreByPlayer.set(r.playerId, entry);
  });

  const scoringPlayers: RankingPlayer[] = [];
  scoreByPlayer.forEach((entry, playerId) => {
    const games = gamesByPlayer.get(playerId) ?? 0;
    const avg = perGame(entry.score, games);
    scoringPlayers.push({
      playerId,
      playerName: entry.name,
      number: entry.number,
      // 화면은 totalCount/avgPerGame을 표시하고 정렬은 totalScore/avgScore를 쓴다
      totalCount: entry.score,
      avgPerGame: avg,
      gamesPlayed: games,
      totalScore: entry.score,
      avgScore: avg,
    });
  });

  const rankings = Array.from(itemsById.values());
  const hasScore = scoringPlayers.some((p) => (p.totalScore ?? 0) > 0);

  return {
    rankings: hasScore
      ? [
          {
            id: SCORING_ITEM_ID,
            name: SCORING_ITEM_NAME,
            value: 1,
            players: scoringPlayers,
          },
          ...rankings,
        ]
      : rankings,
  };
}
