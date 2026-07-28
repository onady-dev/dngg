import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  INQUIRY_PAGE_SIZE_MAX,
  INQUIRY_STATUSES,
  INQUIRY_TYPES,
  InquiryStatus,
  InquiryType,
} from './inquiry.constants';

// authorEmail·userId·status는 의도적으로 없다.
// 전역 ValidationPipe가 whitelist + forbidNonWhitelisted라, 클라이언트가
// 이 값들을 밀어넣으려는 시도는 여기서 400으로 차단된다.
export class CreateInquiryDto {
  @IsIn(INQUIRY_TYPES)
  type: InquiryType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}

export class AnswerInquiryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  answer: string;
}

// 쿼리 파라미터도 전역 ValidationPipe를 탄다. DTO가 없으면 임의 문자열이
// 그대로 where 절에 들어가므로 반드시 @IsIn으로 막는다.
export class ListInquiryQueryDto {
  @IsOptional()
  @IsIn(INQUIRY_STATUSES)
  status?: InquiryStatus;

  // 쿼리 파라미터는 항상 문자열로 도착하므로 @Type으로 숫자 변환을 명시한다.
  // 없으면 @IsInt가 "2"에 걸려 정상 요청이 400이 된다.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  // 상한이 없으면 limit=999999로 페이지네이션을 통째로 우회할 수 있다.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(INQUIRY_PAGE_SIZE_MAX)
  limit?: number;
}
