import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class PostTeamRequestDto {
  @IsNotEmpty()
  @IsNumber()
  groupId: number;
  @IsNotEmpty()
  @IsString()
  @MaxLength(30)
  name: string;
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  playerIds?: number[];
}

export class PutTeamRequestDto {
  @IsNotEmpty()
  @IsNumber()
  groupId: number;
  @IsOptional()
  @IsString()
  @MaxLength(30)
  name?: string;
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  playerIds?: number[];
}

export class BulkTeamItemDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(30)
  name: string;
  @IsArray()
  @IsNumber({}, { each: true })
  playerIds: number[];
}

export class BulkTeamsRequestDto {
  @IsNotEmpty()
  @IsNumber()
  groupId: number;
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BulkTeamItemDto)
  teams: BulkTeamItemDto[];
}
