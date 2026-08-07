import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  VERIFICATION_PURPOSES,
  VerificationPurpose,
} from './email-verification.constants';

// 문자열이면 앞뒤 공백을 제거하고, 문자열이 아니면 그대로 통과시켜 이후 @IsString이
// 타입 에러로 잡게 한다(여기서 강제 변환하면 타입 검증이 무력화된다).
const trimIfString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

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
  // 그룹명은 로그인 아이디이기도 하다 — 로그인은 입력을 trim하므로, 앞뒤 공백이
  // 섞인 채로 저장되면 화면에 보이는 이름으로는 영영 로그인되지 않는다.
  // 길이 검증보다 먼저 trim되도록 @Transform이 붙어 있다(변환은 검증 전에 일어난다).
  @Transform(trimIfString)
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
  @Transform(trimIfString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  identifier?: string;

  // 캐시된 구버전 프론트 번들 호환용 — 새 클라이언트는 identifier를 보낸다.
  // 전역 ValidationPipe가 forbidNonWhitelisted라 여기 선언해 두지 않으면 400이 난다.
  @ValidateIf((o: LoginUserDto) => o.email !== undefined)
  @Transform(trimIfString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  email?: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
