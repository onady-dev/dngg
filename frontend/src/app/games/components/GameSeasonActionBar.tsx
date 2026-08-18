"use client";

import React, { useEffect, useState } from "react";
import styled from "styled-components";
import type { Season } from "@/lib/seasonApi";

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
  flex-wrap: wrap;
`;

const CountBadge = styled.span`
  flex-shrink: 0;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--primary-color);
  white-space: nowrap;
`;

const Select = styled.select`
  flex: 1;
  min-width: 8rem;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  background: white;
`;

const AssignButton = styled.button`
  flex-shrink: 0;
  padding: 0.5rem 0.875rem;
  border-radius: 0.375rem;
  background-color: var(--primary-color);
  color: white;
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const CancelButton = styled.button`
  flex-shrink: 0;
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  background-color: #f3f4f6;
  color: #6b7280;
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
`;

// 시즌 미지정으로 되돌리기를 나타내는 <option> 값.
// 숫자 id와 섞이지 않는 문자열이어야 한다.
const NONE_VALUE = "none";

interface Props {
  count: number;
  seasons: Season[];
  busy: boolean;
  onAssign: (seasonId: number | null) => void;
  onCancel: () => void;
}

export default function GameSeasonActionBar({
  count,
  seasons,
  busy,
  onAssign,
  onCancel,
}: Props) {
  const [value, setValue] = useState<string>(
    seasons.length > 0 ? String(seasons[0].id) : NONE_VALUE
  );

  // seasons는 상위(그룹 전환 등)에서 언제든 교체될 수 있다. useState 초기값은
  // 첫 렌더에만 적용되므로, 이전 그룹의 시즌 id가 화면(select가 보여주는 값)과
  // 실제 전송값 사이에서 어긋나지 않도록 목록이 바뀔 때마다 재검증한다.
  // NONE_VALUE는 항상 유효한 선택지이므로 그대로 둔다.
  useEffect(() => {
    if (value === NONE_VALUE) return;
    const stillValid = seasons.some((s) => String(s.id) === value);
    if (!stillValid) {
      setValue(seasons.length > 0 ? String(seasons[0].id) : NONE_VALUE);
    }
  }, [seasons, value]);

  return (
    <Bar role="toolbar" aria-label="선택한 경기 시즌 배정">
      <CountBadge>{count}건 선택됨</CountBadge>
      <Select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        aria-label="배정할 시즌"
      >
        {seasons.map((season) => (
          <option key={season.id} value={season.id}>
            {season.name}
          </option>
        ))}
        <option value={NONE_VALUE}>시즌 미지정으로</option>
      </Select>
      <AssignButton
        onClick={() => onAssign(value === NONE_VALUE ? null : Number(value))}
        disabled={busy || count === 0}
      >
        배정
      </AssignButton>
      <CancelButton onClick={onCancel} disabled={busy}>
        취소
      </CancelButton>
    </Bar>
  );
}
