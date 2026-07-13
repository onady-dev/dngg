import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  email: string;
  @IsNotEmpty()
  @IsString()
  password: string;
  @IsNotEmpty()
  @IsString()
  groupName: string;
  @IsOptional()
  @IsString()
  phoneNumber: string;
}

export class UpdateUserDto {
  email?: string;
  password?: string;
  phoneNumber?: string;
  groupId?: number;
} 