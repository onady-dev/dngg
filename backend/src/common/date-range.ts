import { BadRequestException } from '@nestjs/common';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// GET /game의 from/to는 DTO 없이 원시 쿼리 파라미터로 들어오므로
// 전역 ValidationPipe가 관여하지 않는다. 여기서 막지 않으면 잘못된 문자열이
// 그대로 SQL 파라미터로 내려가 Postgres 에러(500)가 된다.
// YYYY-MM-DD는 사전순 비교가 곧 날짜 비교라 문자열 그대로 대소를 판정할 수 있다.
export function assertValidDateRange(from?: string, to?: string): void {
  if (from !== undefined && !DATE_PATTERN.test(from)) {
    throw new BadRequestException('from은 YYYY-MM-DD 형식이어야 합니다.');
  }
  if (to !== undefined && !DATE_PATTERN.test(to)) {
    throw new BadRequestException('to는 YYYY-MM-DD 형식이어야 합니다.');
  }
  if (from !== undefined && to !== undefined && from > to) {
    throw new BadRequestException('from은 to보다 뒤일 수 없습니다.');
  }
}
