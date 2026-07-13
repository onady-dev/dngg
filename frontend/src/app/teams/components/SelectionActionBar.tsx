"use client";

import React from "react";
import styled from "styled-components";
import type { Team } from "@/types/player";

const Bar = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  /* InstallPrompt 배너(z-index 1000)보다 위 — 배정 작업이 진행 중일 때 우선 */
  z-index: 1100;
  background: white;
  border-top: 1px solid var(--border-color);
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.08);
  padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const CountBadge = styled.span`
  flex-shrink: 0;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--primary-color);
  white-space: nowrap;
`;

const TeamButtons = styled.div`
  flex: 1;
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
`;

const TeamButton = styled.button`
  flex-shrink: 0;
  padding: 0.5rem 0.875rem;
  border-radius: 999px;
  background-color: var(--primary-color);
  color: white;
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;

  &:hover {
    background-color: var(--hover-color);
  }
`;

const ClearButton = styled.button`
  flex-shrink: 0;
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  background-color: #f3f4f6;
  color: #6b7280;
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;

  &:hover {
    background-color: #e5e7eb;
  }
`;

const NoTeamHint = styled.span`
  flex: 1;
  font-size: 0.8125rem;
  color: #6b7280;
`;

interface SelectionActionBarProps {
  count: number;
  teams: Team[];
  onAssign: (teamId: number) => void;
  onClear: () => void;
  onAddTeam: () => void;
}

export default function SelectionActionBar({ count, teams, onAssign, onClear, onAddTeam }: SelectionActionBarProps) {
  if (count === 0) return null;

  return (
    <Bar role="toolbar" aria-label="선택한 선수 팀 배정">
      <CountBadge>{count}명 선택됨</CountBadge>
      {teams.length > 0 ? (
        <TeamButtons>
          {teams.map((team) => (
            <TeamButton key={team.id} onClick={() => onAssign(team.id)}>
              {team.name} ({team.players.length}명) ←
            </TeamButton>
          ))}
        </TeamButtons>
      ) : (
        <>
          <NoTeamHint>배정할 팀이 없습니다.</NoTeamHint>
          <TeamButton onClick={onAddTeam}>팀 추가</TeamButton>
        </>
      )}
      <ClearButton onClick={onClear}>선택 해제</ClearButton>
    </Bar>
  );
}
