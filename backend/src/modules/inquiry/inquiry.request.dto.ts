import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
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
}
