import { IsNotEmpty, IsString } from "class-validator";

export class PostGroupRequestDto {
    @IsNotEmpty()
    @IsString()
    name: string;
}
