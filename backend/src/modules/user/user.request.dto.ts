import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';
import {
  VERIFICATION_PURPOSES,
  VerificationPurpose,
} from './email-verification.constants';

export class CreateUserDto {
  @IsEmail()
  email: string;
  @IsString()
  @MinLength(8)
  password: string;
  @IsString()
  @Length(1, 30)
  name: string;
  // Group.name 컬럼이 varchar(20)이므로 DTO에서 먼저 길이를 검증한다.
  @IsNotEmpty()
  @IsString()
  @Length(1, 20)
  groupName: string;
  @IsNotEmpty()
  @IsString()
  verificationToken: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
  @IsOptional()
  @IsString()
  @Length(1, 30)
  name?: string;
}

export class RequestEmailVerificationDto {
  @IsEmail()
  email: string;
  @IsIn(VERIFICATION_PURPOSES)
  purpose: VerificationPurpose;
}

export class ConfirmEmailVerificationDto {
  @IsEmail()
  email: string;
  @IsString()
  @Length(6, 6)
  code: string;
  @IsIn(VERIFICATION_PURPOSES)
  purpose: VerificationPurpose;
}

export class ResetPasswordDto {
  @IsNotEmpty()
  @IsString()
  verificationToken: string;
  @IsString()
  @MinLength(8)
  newPassword: string;
}
