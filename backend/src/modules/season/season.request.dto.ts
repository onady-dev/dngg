import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class PostSeasonRequestDto {
  @IsNotEmpty()
  @IsNumber()
  groupId: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(30)
  name: string;
}

export class PutSeasonRequestDto {
  @IsNotEmpty()
  @IsNumber()
  groupId: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(30)
  name: string;
}

export class GetSeasonsRequestDto {
  @Type(() => Number)
  @IsNotEmpty()
  @IsNumber()
  groupId: number;
}

export class PutCurrentSeasonRequestDto {
  @IsNotEmpty()
  @IsNumber()
  groupId: number;

  // null은 "현재 시즌 해제"를 뜻하므로 null일 때는 숫자 검증을 건너뛴다.
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  seasonId: number | null;
}
