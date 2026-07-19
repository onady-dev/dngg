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
