import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class PostPlayerRequestDto {
    @IsNotEmpty()
    @IsNumber()
    groupId: number;
    @IsNotEmpty()
    @IsString()
    name: string;
    @IsOptional()
    @IsString()
    backnumber: string;
}
