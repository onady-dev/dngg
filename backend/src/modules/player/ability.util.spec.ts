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
