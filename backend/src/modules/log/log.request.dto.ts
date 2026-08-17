import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Matches } from 'class-validator';

export class PostLogRequestDto {
  @IsNotEmpty()
  @IsNumber()
  groupId: number;
  @IsNotEmpty()
  @IsNumber()
  gameId: number;
  @IsNotEmpty()
  @IsNumber()
  playerId: number;
  @IsNotEmpty()
  @IsNumber()
  logitemId: number;
}

export class GetLogByDailyRequestDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date는 YYYY-MM-DD 형식이어야 합니다.',
  })
  date: string;

  @Type(() => Number)
  @IsNotEmpty()
  @IsNumber()
  groupId: number;
}

export class GetDailyDatesRequestDto {
  @Type(() => Number)
  @IsNotEmpty()
  @IsNumber()
  groupId: number;
}

export class GetRankingsRequestDto {
  @Type(() => Number)
  @IsNotEmpty()
  @IsNumber()
  groupId: number;

  // 생략하면 전체(시즌 미지정 경기 포함)를 집계한다.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  seasonId?: number;
}
