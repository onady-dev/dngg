"use client";

import * as S from "./styles";

// 조회 실패와 "데이터 없음"을 구분한다.
//
// 네 카드가 같은 표현을 쓰도록 한 곳에 모았다 — 하나만 고치면 카드마다 실패
// 표시가 달라져 오히려 읽기 어려워진다. 특히 유료화 카드는 조회 실패를
// "아직 시작 전"으로 표시하면 되돌릴 수 없는 시작 버튼을 함께 띄우게 된다.
export const CardFallback = ({
  isPending,
  onRetry,
}: {
  isPending: boolean;
  onRetry: () => void;
}) =>
  isPending ? (
    <S.StatusLine>불러오는 중...</S.StatusLine>
  ) : (
    <S.ErrorLine>
      불러오지 못했습니다.
      <S.SmallButton onClick={onRetry}>다시 시도</S.SmallButton>
    </S.ErrorLine>
  );
