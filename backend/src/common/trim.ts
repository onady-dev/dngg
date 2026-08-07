// 문자열이면 앞뒤 공백을 제거하고, 문자열이 아니면 그대로 통과시켜 이후 @IsString이
// 타입 에러로 잡게 한다(여기서 강제 변환하면 타입 검증이 무력화된다).
// class-transformer의 변환은 검증보다 먼저 일어나므로 @Length 같은 길이 검증도
// trim된 값을 기준으로 동작한다.
export const trimIfString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
