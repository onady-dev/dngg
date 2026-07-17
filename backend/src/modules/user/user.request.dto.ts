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
  @IsNotEmpty()
  @IsString()
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
