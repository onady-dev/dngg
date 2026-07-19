"use client";

import React from "react";
import RadarChart from "./RadarChart";
import { PlayerAbility } from "./types";
import * as S from "./styles/PlayerDetailStyles";

interface AbilityCardProps {
  ability: PlayerAbility | null;
}

export default function AbilityCard({ ability }: AbilityCardProps) {
  if (!ability) return null;

  const modeLabel = ability.mode === "basketball" ? "농구" : "커스텀";

  if (!ability.hasData) {
    return (
      <S.AbilityCardWrap>
        <S.AbilityHeader>
          <S.AbilityTitle>능력치</S.AbilityTitle>
        </S.AbilityHeader>
        <S.AbilityEmpty>능력치를 계산할 기록이 부족합니다.</S.AbilityEmpty>
      </S.AbilityCardWrap>
    );
  }

  // 모집단이 1명 이하면 백분위(score)가 null → 원값 목록으로 폴백
  const scored = ability.axes.every((a) => a.score !== null);

  return (
    <S.AbilityCardWrap>
      <S.AbilityHeader>
        <S.AbilityTitle>능력치</S.AbilityTitle>
        <S.AbilityModeBadge>{modeLabel}</S.AbilityModeBadge>
      </S.AbilityHeader>

      {scored ? (
        <>
          <RadarChart
            axes={ability.axes.map((a) => ({ label: a.label, value: a.score as number }))}
          />
          <S.AbilityCaption>
            그룹 내 상대평가 (상위 백분위, 표본 {ability.gamesPlayed}경기
            {ability.gamesPlayed < 3 ? " · 참고용" : ""})
          </S.AbilityCaption>
        </>
      ) : (
        <>
          <S.AbilityRawList>
            {ability.axes.map((a) => (
              <li key={a.key}>
                <span>{a.label}</span>
                <span>{a.rawPerGame} / 게임</span>
              </li>
            ))}
          </S.AbilityRawList>
          <S.AbilityCaption>
            비교 대상 선수가 부족해 원값(게임당 평균)만 표시합니다.
          </S.AbilityCaption>
        </>
      )}
    </S.AbilityCardWrap>
  );
}
