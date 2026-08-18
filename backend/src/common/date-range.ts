import { BadRequestException } from '@nestjs/common';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// 형식(YYYY-MM-DD)뿐 아니라 실재하는 달력 날짜인지까지 검증한다.
// "2026-02-30", "2026-13-01" 같은 값은 정규식은 통과하지만 실재하지 않아
// 그대로 SQL로 내려가면 Postgres가 "date/time field value out of range"로
// 500을 낸다.
//
// new Date(string) + getMonth()/getDate() 조합은 쓰지 않는다 — 문자열 파싱은
// UTC 기준인데 getMonth() 등은 로컬 타임존 기준이라 UTC보다 서쪽 타임존에서
// 자정 언저리 날짜가 하루 밀려 잘못 판정될 수 있다. 여기서는 연/월/일을
// 문자열에서 직접 뽑아 UTC 계산만으로 "그 달의 마지막 날짜"를 구해 비교한다.
function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  // Date.UTC(year, month, 0): month(1-based 값)를 0-based "다음 달" 인덱스로
  // 취급하고 day를 0으로 주면 원하는 달의 마지막 날짜로 굴러떨어진다.
  // 윤년의 2월도 이 계산에 자동으로 반영된다(2024-02 -> 29, 2026-02 -> 28).
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= lastDayOfMonth;
}

function isValidDateString(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, yearStr, monthStr, dayStr] = match;
  return isRealCalendarDate(Number(yearStr), Number(monthStr), Number(dayStr));
}

// GET /game의 from/to는 DTO 없이 원시 쿼리 파라미터로 들어오므로
// 전역 ValidationPipe가 관여하지 않는다. 여기서 막지 않으면 잘못된 문자열이
// 그대로 SQL 파라미터로 내려가 Postgres 에러(500)가 된다.
// YYYY-MM-DD는 사전순 비교가 곧 날짜 비교라 문자열 그대로 대소를 판정할 수 있다.
export function assertValidDateRange(from?: string, to?: string): void {
  if (from !== undefined && !isValidDateString(from)) {
    throw new BadRequestException(
      'from은 YYYY-MM-DD 형식의 실재하는 날짜여야 합니다.',
    );
  }
  if (to !== undefined && !isValidDateString(to)) {
    throw new BadRequestException(
      'to는 YYYY-MM-DD 형식의 실재하는 날짜여야 합니다.',
    );
  }
  if (from !== undefined && to !== undefined && from > to) {
    throw new BadRequestException('from은 to보다 뒤일 수 없습니다.');
  }
}
