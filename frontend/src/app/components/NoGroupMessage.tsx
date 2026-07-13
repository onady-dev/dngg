"use client";

import * as S from "../styles/HomeStyles";

export default function NoGroupMessage() {
  return (
    <S.NoGroupContainer>
      <S.NoGroupContent>
        <S.NoGroupTitle>그룹을 선택해주세요</S.NoGroupTitle>
        <S.NoGroupText>상단의 그룹 선택 메뉴에서 원하는 그룹을 선택하면 해당 그룹의 게임 기록을 볼 수 있습니다.</S.NoGroupText>
        <S.UpArrow>↑</S.UpArrow>
      </S.NoGroupContent>
    </S.NoGroupContainer>
  );
}
