export type InquiryType = 'bug' | 'feature' | 'billing' | 'etc';

export type InquiryStatus = 'pending' | 'answered';

// DTO의 @IsIn과 엔티티 타입이 갈라지지 않도록 배열을 단일 출처로 둔다.
export const INQUIRY_TYPES: InquiryType[] = [
  'bug',
  'feature',
  'billing',
  'etc',
];

export const INQUIRY_STATUSES: InquiryStatus[] = ['pending', 'answered'];

// 목록 페이지 크기. DTO(검증)와 서비스(기본값)가 함께 참조하므로 여기에 둔다 —
// 서비스에 두면 dto ↔ service 순환 임포트가 된다.
export const INQUIRY_PAGE_SIZE_DEFAULT = 20;
export const INQUIRY_PAGE_SIZE_MAX = 100;

// 회신 메일 본문에 쓰는 한글 라벨
export const INQUIRY_TYPE_LABELS: Record<InquiryType, string> = {
  bug: '버그 신고',
  feature: '기능 제안',
  billing: '결제·구독',
  etc: '기타',
};
