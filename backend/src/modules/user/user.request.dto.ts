import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import {
  VERIFICATION_PURPOSES,
  VerificationPurpose,
} from './email-verification.constants';

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