import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class PostGameRequestDto {
  @IsNotEmpty()
  @IsNumber()
  groupId: number;
  @IsNotEmpty()
  @IsString()
  name: string;
}

export class PostGameAndLogsRequestDto {
  @IsOptional()
  @IsNumber()
  id: number;
  @IsNotEmpty()
  @IsNumber()
  groupId: number;
  @IsNotEmpty()
  @IsString()
  homeTeamName: string;
  @IsNotEmpty()
  @IsString()
  awayTeamName: string;
  @IsNotEmpty()
  @IsArray()
  homePlayers: HomePlayer[];
  @IsNotEmpty()
  @IsArray()
  awayPlayers: AwayPlayer[];
  @IsOptional()
  @IsArray()
  logs: Log[] = [];
  @IsOptional()
  @IsString()
  status: string;
}

class HomePlayer {
  @IsNumber()
  id: number;
}

class AwayPlayer {
  @IsNumber()
  id: number;
}

class Log {
  @IsNumber()
  playerId: number;
  @IsNumber()
  logitemId: number;
}

export class PatchGameQuarterRequestDto {
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Max(10)
  quarter: number;
}

export class PutGameSeasonRequestDto {
  @IsNotEmpty()
  @IsNumber()
  groupId: number;

  // 상한 없는 배열을 받는 엔드포인트를 열어두지 않는다.
  // 현재 최대 그룹이 45경기라 실질 제약은 아니다.
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  gameIds: number[];

  // null은 "시즌 미지정으로 되돌리기"를 뜻하는 정상 입력값이므로
  // null일 때는 숫자 검증을 건너뛴다.
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  seasonId: number | null;
}
