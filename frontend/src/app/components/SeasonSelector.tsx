"use client";

import React, { useState } from "react";
import styled from "styled-components";
import type { Season } from "@/lib/seasonApi";
import type { SeasonSelection } from "../stores/seasonStore";
import SeasonManageModal from "./SeasonManageModal";

interface Props {
  groupId: number;
  seasons: Season[];
  currentSeasonId: number | null;
  selection: SeasonSelection;
  canManage: boolean;
  onChange: (selection: SeasonSelection) => void;
  onSeasonsChanged: () => void;
}

export default function SeasonSelector({
  groupId,
  seasons,
  currentSeasonId,
  selection,
  canManage,
  onChange,
  onSeasonsChanged,
}: Props) {
  const [isManageOpen, setIsManageOpen] = useState(false);

  // 시즌이 없는 그룹에서는 선택기를 숨긴다.
  // 단 그룹장에게는 만들 진입점을 남긴다 — 없으면 시즌을 만들 방법이 없다.
  if (seasons.length === 0) {
    if (!canManage) return null;
    return (
      <>
        <Bar>
          <ManageButton onClick={() => setIsManageOpen(true)}>
            + 시즌 만들기
          </ManageButton>
        </Bar>
        <SeasonManageModal
          isOpen={isManageOpen}
          groupId={groupId}
          seasons={seasons}
          currentSeasonId={currentSeasonId}
          onClose={() => setIsManageOpen(false)}
          onChanged={onSeasonsChanged}
        />
      </>
    );
  }

  return (
    <>
      <Bar>
        <Select
          value={selection === "all" ? "all" : String(selection)}
          onChange={(e) =>
            onChange(e.target.value === "all" ? "all" : Number(e.target.value))
          }
        >
          <option value="all">전체 기간</option>
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name}
              {season.id === currentSeasonId ? " (현재)" : ""}
            </option>
          ))}
        </Select>
        {canManage && (
          <ManageButton onClick={() => setIsManageOpen(true)}>시즌 관리</ManageButton>
        )}
      </Bar>
      <SeasonManageModal
        isOpen={isManageOpen}
        groupId={groupId}
        seasons={seasons}
        currentSeasonId={currentSeasonId}
        onClose={() => setIsManageOpen(false)}
        onChanged={onSeasonsChanged}
      />
    </>
  );
}

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
`;

const Select = styled.select`
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  background: #fff;
`;

const ManageButton = styled.button`
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
`;
