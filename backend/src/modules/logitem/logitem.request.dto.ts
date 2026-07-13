import { IsNotEmpty, IsString } from "class-validator";

export class PostLogitemRequestDto {
    @IsNotEmpty()
    @IsString()
    groupId: string;
    @IsNotEmpty()
    @IsString()
    name: string;
    @IsNotEmpty()
    @IsString()
    value: string;
}
