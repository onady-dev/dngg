import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MinLength,
  ValidateIf,
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

export class LoginUserDto {
  // 이메일 또는 그룹명. 둘 다 비면 양쪽 검증이 모두 실패해 400이 된다.
  @ValidateIf((o: LoginUserDto) => !o.email)
  @IsString()
  @IsNotEmpty()
  identifier?: string;

  // 캐시된 구버전 프론트 번들 호환용 — 새 클라이언트는 identifier를 보낸다.
  // 전역 ValidationPipe가 forbidNonWhitelisted라 여기 선언해 두지 않으면 400이 난다.
  @ValidateIf((o: LoginUserDto) => !o.identifier)
  @IsString()
  @IsNotEmpty()
  email?: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
