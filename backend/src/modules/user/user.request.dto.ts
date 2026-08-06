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
  // identifier가 오면 항상 타입을 검증한다. 둘 다 없을 때만 존재를 강제해 400을 낸다.
  // (양쪽에 서로를 참조하는 ValidateIf를 걸면 두 키가 동시에 오는 요청에서
  //  서로가 서로의 검증을 꺼버려 타입 검사가 통째로 사라진다.)
  @ValidateIf(
    (o: LoginUserDto) => o.identifier !== undefined || o.email === undefined,
  )
  @IsString()
  @IsNotEmpty()
  identifier?: string;

  // 캐시된 구버전 프론트 번들 호환용 — 새 클라이언트는 identifier를 보낸다.
  // 전역 ValidationPipe가 forbidNonWhitelisted라 여기 선언해 두지 않으면 400이 난다.
  @ValidateIf((o: LoginUserDto) => o.email !== undefined)
  @IsString()
  @IsNotEmpty()
  email?: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
