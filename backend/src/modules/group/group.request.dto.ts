import { IsNotEmpty, IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { trimIfString } from '../../common/trim';

export class PostGroupRequestDto {
  // 가입(CreateUserDto.groupName)과 같은 컬럼에 쓰는 두 번째 경로다.
  // Group.name은 로그인 아이디이기도 하므로 위생 규칙을 동일하게 맞춘다:
  // 앞뒤 공백이 남으면 화면에 보이는 이름으로 로그인이 되지 않고,
  // varchar(20)을 넘기면 DB에서 500이 난다.
  @Transform(trimIfString)
  @IsNotEmpty()
  @IsString()
  @Length(1, 20)
  name: string;
}
