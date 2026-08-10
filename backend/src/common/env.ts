// 잘못된 환경변수 때문에 컨테이너가 부팅에 실패하는 것보다, 기본값으로
// 조용히 폴백하고 뜨는 편이 운영에서 안전하다.
// 빈 문자열은 Number('')이 0이 되므로 양수 조건에서 함께 걸러진다.
export function readPositiveInt(
  raw: string | undefined,
  fallback: number,
): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
