import { IsNotEmpty, IsNumber, IsString } from "class-validator";

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
    date: string;
}
