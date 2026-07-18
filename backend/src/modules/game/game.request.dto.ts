import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
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
