"use client";

import React from "react";
import { PlayerTeamImpact, GameResultLetter } from "./types";
import * as S from "./styles/TeamImpactStyles";

interface Props {
  impact: PlayerTeamImpact | null;
}

const RESULT_TEXT: Record<GameResultLetter, string> = { W: "승", D: "무", L: "패" };

function WinRateGauge({ value }: { value: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * c;
  return (
    <S.GaugeWrap>
      <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden>
        <circle cx="44" cy="44" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="44"
          cy="44"
          r={r}
          fill="none"
          stroke="url(#wr)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform="rotate(-90 44 44)"
        />
        <defs>
          <linearGradient id="wr" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
        </defs>
      </svg>
      <S.GaugeLabel>
        <S.GaugeValue>{value}%</S.GaugeValue>
        <S.GaugeCaption>승률</S.GaugeCaption>
      </S.GaugeLabel>
    </S.GaugeWrap>
  );
}

export default function TeamImpactCard({ impact }: Props) {
  if (!impact) return null;

  if (!impact.hasData) {
    return (
      <S.Card>
        <S.CardHead>
          <S.CardTitle>팀 기여도</S.CardTitle>
        </S.CardHead>
        <S.Empty>완료된 경기가 없어 아직 집계할 수 없습니다.</S.Empty>
      </S.Card>
    );
  }

  const { record, streak, clutch, ability, impact: pts } = impact;
  const contributions = impact.contributions.filter((c) => c.present);

  const streakLabel =
    streak.currentType && streak.current > 0
      ? `현재 ${streak.current}${streak.currentType === "W" ? "연승" : streak.currentType === "L" ? "연패" : "연속 무"}`
      : null;

  const maxImpact = Math.max(pts.avgPointsInWins ?? 0, pts.avgPointsInLosses ?? 0, 1);

  return (
    <S.Card>
      <S.CardHead>
        <S.CardTitle>팀 기여도</S.CardTitle>
        <S.CountBadge>완료 {impact.finishedGames}경기</S.CountBadge>
      </S.CardHead>

      {/* 전적 */}
      <S.Section>
        <S.SectionLabel>전적</S.SectionLabel>
        <S.RecordRow>
          <WinRateGauge value={impact.winRate ?? 0} />
          <S.RecordMeta>
            <S.RecordLine>
              <span className="w">{record.wins}승</span>
              {" · "}
              <span className="d">{record.draws}무</span>
              {" · "}
              <span className="l">{record.losses}패</span>
            </S.RecordLine>
            {impact.recentForm.length > 0 && (
              <S.FormDots>
                {impact.recentForm.map((res, i) => (
                  <S.Dot key={i} result={res} title={RESULT_TEXT[res]}>
                    {RESULT_TEXT[res]}
                  </S.Dot>
                ))}
              </S.FormDots>
            )}
            <S.StreakText>
              {streakLabel ? `${streakLabel} · ` : ""}최다 {streak.best}연승
            </S.StreakText>
          </S.RecordMeta>
        </S.RecordRow>
      </S.Section>

      {/* 팀 득실 */}
      <S.Section>
        <S.SectionLabel>팀 득실</S.SectionLabel>
        <S.Tiles>
          <S.Tile>
            <S.TileLabel>평균 득점</S.TileLabel>
            <S.TileValue tone="up">{impact.avgTeamScore}</S.TileValue>
          </S.Tile>
          <S.Tile>
            <S.TileLabel>평균 실점</S.TileLabel>
            <S.TileValue tone="down">{impact.avgOpponentScore}</S.TileValue>
          </S.Tile>
          <S.Tile>
            <S.TileLabel>득실 마진</S.TileLabel>
            <S.TileValue tone={impact.avgMargin >= 0 ? "up" : "down"}>
              {impact.avgMargin > 0 ? `+${impact.avgMargin}` : impact.avgMargin}
            </S.TileValue>
          </S.Tile>
        </S.Tiles>
        {clutch.games > 0 && (
          <S.ClutchLine>
            접전(5점차 이내) {clutch.wins}승 {clutch.draws}무 {clutch.losses}패
            {clutch.winRate !== null && (
              <>
                {" · 승률 "}
                <strong>{clutch.winRate}%</strong>
              </>
            )}
          </S.ClutchLine>
        )}
      </S.Section>

      {/* 개인 기여 */}
      {contributions.length > 0 && (
        <S.Section>
          <S.SectionLabel>개인 기여 (팀 대비 비중)</S.SectionLabel>
          {contributions.map((c) => (
            <S.BarRow key={c.key}>
              <S.BarLabel>{c.label}</S.BarLabel>
              <S.BarTrack>
                <S.BarFill pct={c.share ?? 0} />
              </S.BarTrack>
              <S.BarValue>{c.share !== null ? `${c.share}%` : "-"}</S.BarValue>
            </S.BarRow>
          ))}
        </S.Section>
      )}

      {/* 능력 지표 */}
      <S.Section>
        <S.SectionLabel>능력 지표</S.SectionLabel>
        <S.AbilityGrid>
          <S.AbilityItem>
            <S.AbilityName>종합 기여 지수 (EFF)</S.AbilityName>
            <S.AbilityVal>
              {ability.effPerGame}
              <small>/ 게임</small>
            </S.AbilityVal>
          </S.AbilityItem>
          <S.AbilityItem>
            <S.AbilityName>어시–턴오버 비율</S.AbilityName>
            <S.AbilityVal>
              {ability.astToRatio !== null ? ability.astToRatio : "—"}
              <small>
                어시 {ability.astCount} / 턴오버 {ability.toCount}
              </small>
            </S.AbilityVal>
          </S.AbilityItem>
          {(pts.avgPointsInWins !== null || pts.avgPointsInLosses !== null) && (
            <>
              <S.BarRow>
                <S.BarLabel>승리 시</S.BarLabel>
                <S.BarTrack>
                  <S.BarFill pct={((pts.avgPointsInWins ?? 0) / maxImpact) * 100} />
                </S.BarTrack>
                <S.BarValue>
                  {pts.avgPointsInWins !== null ? `${pts.avgPointsInWins}점` : "-"}
                </S.BarValue>
              </S.BarRow>
              <S.BarRow>
                <S.BarLabel>패배 시</S.BarLabel>
                <S.BarTrack>
                  <S.BarFill pct={((pts.avgPointsInLosses ?? 0) / maxImpact) * 100} />
                </S.BarTrack>
                <S.BarValue>
                  {pts.avgPointsInLosses !== null ? `${pts.avgPointsInLosses}점` : "-"}
                </S.BarValue>
              </S.BarRow>
            </>
          )}
        </S.AbilityGrid>
        <S.Caption>EFF = 득점＋리바＋어시＋스틸＋블록－턴오버－파울 (게임당, 미스슛 미기록 간이 지표)</S.Caption>
      </S.Section>

      {/* 케미 */}
      {impact.bestTeammates.length > 0 && (
        <S.Section>
          <S.SectionLabel>가장 잘 맞는 동료 (3경기 이상)</S.SectionLabel>
          <S.MateList>
            {impact.bestTeammates.map((m, i) => (
              <S.MateRow key={m.playerId}>
                <S.MateRank>{i + 1}</S.MateRank>
                <S.MateName>{m.name}</S.MateName>
                <S.MateRecord>
                  {m.wins}승 {m.draws > 0 ? `${m.draws}무 ` : ""}{m.losses}패
                </S.MateRecord>
                <S.MateRate>{m.winRate}%</S.MateRate>
              </S.MateRow>
            ))}
          </S.MateList>
        </S.Section>
      )}
    </S.Card>
  );
}
