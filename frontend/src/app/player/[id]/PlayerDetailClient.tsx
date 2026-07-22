"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { GameRecord, GroupPlayer, Player, PlayerAbility, PlayerTeamImpact } from "./types";
import AbilityCard from "./AbilityCard";
import PlayerSwitcher from "./PlayerSwitcher";
import ShareButton from "./ShareButton";
import TeamImpactCard from "./TeamImpactCard";
import * as S from "./styles/PlayerDetailStyles";

interface PlayerDetailClientProps {
  player: Player;
  gameRecords: GameRecord[];
  allLogItemNames: string[];
  ability: PlayerAbility | null;
  teamImpact: PlayerTeamImpact | null;
  groupPlayers: GroupPlayer[];
}

export default function PlayerDetailClient({ player, gameRecords, allLogItemNames, ability, teamImpact, groupPlayers }: PlayerDetailClientProps) {
  const router = useRouter();

  // 실제 게임 기록 사용
  const displayRecords = useMemo(() => {
    return gameRecords;
  }, [gameRecords]);

  // 각 로그 아이템별 총 횟수와 점수 계산
  const totalStats = useMemo(() => {
    const totals: Record<string, { count: number; score: number }> = {};
    allLogItemNames.forEach((name) => {
      totals[name] = { count: 0, score: 0 };
    });

    displayRecords.forEach((record) => {
      record.logs.forEach((log) => {
        totals[log.name].count += log.count;
        totals[log.name].score += log.value;
      });
    });

    return totals;
  }, [displayRecords, allLogItemNames]);

  // 총 점수
  const totalScore = useMemo(() => {
    return displayRecords.reduce((sum, record) => sum + record.totalScore, 0);
  }, [displayRecords]);

  // 게임당 평균 계산
  const averageStats = useMemo(() => {
    const gameCount = displayRecords.length;
    if (gameCount === 0) return {};

    const averages: Record<string, { count: number; score: number }> = {};

    allLogItemNames.forEach((name) => {
      averages[name] = {
        count: (totalStats[name].count || 0) / gameCount,
        score: (totalStats[name].score || 0) / gameCount,
      };
    });

    return averages;
  }, [totalStats, displayRecords.length, allLogItemNames]);

  // 게임당 평균 점수
  const averageScore = useMemo(() => {
    const gameCount = displayRecords.length;
    return gameCount > 0 ? totalScore / gameCount : 0;
  }, [totalScore, displayRecords.length]);

  return (
    <S.Container>
      <S.PlayerInfoCard>
        <S.PlayerHeader>
          <S.PlayerName>{player.name}</S.PlayerName>
          <S.PlayerBadge>
            {player.position} #{player.backnumber}
          </S.PlayerBadge>
        </S.PlayerHeader>
        <PlayerSwitcher players={groupPlayers} currentPlayerId={player.id} />
      </S.PlayerInfoCard>

      <AbilityCard ability={ability} />

      <ShareButton playerId={player.id} />

      <TeamImpactCard impact={teamImpact} />

      <S.StatsCard>
        <S.TableContainer>
          <S.Table>
            <thead>
              <tr>
                <S.Th isFirst>게임 정보</S.Th>
                <S.Th>득점</S.Th>
                {allLogItemNames.map((name) => (
                  <S.Th key={name}>{name}</S.Th>
                ))}
              </tr>
            </thead>
            <tbody>
              <S.SummaryRow>
                <S.Td isFirst highlight>
                  <S.GameName>전체 기록</S.GameName>
                </S.Td>
                <S.Td highlight>
                  <S.StatValue isPositive={totalScore >= 0}>{totalScore}점</S.StatValue>
                </S.Td>
                {allLogItemNames.map((name) => {
                  const stats = totalStats[name];
                  return (
                    <S.Td key={name} highlight>
                      <S.StatValue isPositive={stats.count > 0} isNeutral={stats.count === 0}>
                        {stats.count > 0 ? `${stats.count}회` : "-"}
                      </S.StatValue>
                    </S.Td>
                  );
                })}
              </S.SummaryRow>
              <S.AverageRow>
                <S.Td isFirst highlight>
                  <S.GameName>게임당 평균</S.GameName>
                </S.Td>
                <S.Td highlight>
                  <S.StatValue isPositive={averageScore >= 0}>{averageScore.toFixed(1)}점</S.StatValue>
                </S.Td>
                {allLogItemNames.map((name) => {
                  const stats = averageStats[name] || { count: 0, score: 0 };
                  return (
                    <S.Td key={name} highlight>
                      <S.StatValue isPositive={stats.count > 0} isNeutral={stats.count === 0}>
                        {stats.count > 0 ? `${stats.count.toFixed(1)}회` : "-"}
                      </S.StatValue>
                    </S.Td>
                  );
                })}
              </S.AverageRow>
            </tbody>
          </S.Table>
        </S.TableContainer>
      </S.StatsCard>
    </S.Container>
  );
}
