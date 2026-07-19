"use client";

import styled from "styled-components";

export const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: calc(var(--header-height) + 20px) 1rem 2rem;
  min-height: 100vh;
  background-color: #f8fafc;

  @media (max-width: 640px) {
    padding: calc(var(--header-height) + 4px) 0.5rem 1rem;
  }
`;

export const PlayerInfoCard = styled.div`
  background-color: white;
  border-radius: 1rem;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(0, 0, 0, 0.05);

  @media (max-width: 640px) {
    padding: 1rem;
    border-radius: 0.75rem;
    margin-bottom: 1rem;
  }
`;

export const PlayerHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
`;

export const PlayerName = styled.h1`
  font-size: 1.5rem;
  font-weight: 700;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  -webkit-background-clip: text;
  color: transparent;
  line-height: 1.2;

  @media (max-width: 640px) {
    font-size: 1.25rem;
  }
`;

export const PlayerBadge = styled.span`
  padding: 0.375rem 0.75rem;
  background-color: #eff6ff;
  color: #1d4ed8;
  border-radius: 2rem;
  font-size: 0.8125rem;
  font-weight: 600;
  border: 1px solid #dbeafe;
  display: flex;
  align-items: center;
  gap: 0.375rem;
  line-height: 1;

  @media (max-width: 640px) {
    padding: 0.25rem 0.625rem;
    font-size: 0.75rem;
  }
`;

export const StatsCard = styled.div`
  background-color: white;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(0, 0, 0, 0.05);

  @media (max-width: 640px) {
    border-radius: 0.75rem;
  }
`;

export const TableContainer = styled.div`
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    height: 8px;
  }

  &::-webkit-scrollbar-track {
    background: #f1f5f9;
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }
`;

export const Table = styled.table`
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
`;

export const Th = styled.th<{ isFirst?: boolean }>`
  padding: 0.75rem 1rem;
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: #475569;
  background-color: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  border-right: 1px solid #e2e8f0;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: ${(props) => (props.isFirst ? 2 : 1)};

  ${(props) =>
    props.isFirst &&
    `
    left: 0;
    background-color: #f8fafc;
    border-right: 2px solid #cbd5e1;
    min-width: 200px;

    @media (max-width: 640px) {
      min-width: 140px;
    }
  `}

  &:last-child {
    border-right: none;
  }

  @media (max-width: 640px) {
    padding: 0.625rem 0.75rem;
    font-size: 0.7rem;
  }
`;

export const Td = styled.td<{ isFirst?: boolean; highlight?: boolean }>`
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  border-bottom: 1px solid #e2e8f0;
  border-right: 1px solid #e2e8f0;
  background-color: ${(props) => (props.highlight ? "#f8fafc" : "white")};
  position: relative;

  ${(props) =>
    props.isFirst &&
    `
    position: sticky;
    left: 0;
    background-color: ${props.highlight ? "#f8fafc" : "white"};
    z-index: 1;
    border-right: 2px solid #cbd5e1;
    min-width: 200px;

    @media (max-width: 640px) {
      min-width: 140px;
    }
  `}

  &:last-child {
    border-right: none;
  }

  @media (max-width: 640px) {
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
  }
`;

export const GameInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem;

  @media (max-width: 640px) {
    flex-direction: row;
    align-items: center;
    gap: 0.375rem;
  }
`;

export const GameName = styled.span`
  font-weight: 500;
  color: #1e293b;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (max-width: 640px) {
    font-size: 0.75rem;
    max-width: 70px;
  }
`;

export const GameDate = styled.span`
  color: #64748b;
  font-size: 0.75rem;
  line-height: 1.25;

  @media (max-width: 640px) {
    font-size: 0.7rem;
    white-space: nowrap;
    &::before {
      content: "|";
      margin: 0 0.375rem;
      color: #cbd5e1;
    }
  }
`;

export const StatValue = styled.span<{ isPositive?: boolean; isNeutral?: boolean }>`
  font-weight: 500;
  color: ${(props) => {
    if (props.isNeutral) return "#64748b";
    return props.isPositive ? "#2563eb" : "#dc2626";
  }};
  line-height: 1.25;
  white-space: nowrap;

  @media (max-width: 640px) {
    font-size: 0.75rem;
  }
`;

export const SummaryRow = styled.tr`
  background-color: #f8fafc;
`;

export const AverageRow = styled.tr`
  background-color: #eff6ff;
`;

export const AbilityCardWrap = styled.div`
  background-color: white;
  border-radius: 1rem;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(0, 0, 0, 0.05);

  @media (max-width: 640px) {
    padding: 1rem;
    border-radius: 0.75rem;
    margin-bottom: 1rem;
  }
`;

export const AbilityHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
`;

export const AbilityTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  color: #1e293b;
`;

export const AbilityModeBadge = styled.span`
  padding: 0.125rem 0.5rem;
  background-color: #eff6ff;
  color: #1d4ed8;
  border-radius: 1rem;
  font-size: 0.75rem;
  font-weight: 600;
`;

export const AbilityCaption = styled.p`
  margin-top: 0.5rem;
  font-size: 0.8125rem;
  color: #94a3b8;
  text-align: center;
`;

export const AbilityEmpty = styled.p`
  padding: 2rem 1rem;
  text-align: center;
  color: #94a3b8;
  font-size: 0.9375rem;
`;

export const AbilityRawList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-top: 0.5rem;

  li {
    display: flex;
    justify-content: space-between;
    font-size: 0.875rem;
    color: #475569;
    border-bottom: 1px solid #f1f5f9;
    padding-bottom: 0.375rem;
  }
  li span:last-child {
    font-weight: 600;
    color: #1e293b;
  }
`;

/* 선수 전환 콤보박스 */
export const SwitcherWrap = styled.div`
  position: relative;
  margin-top: 0.75rem;
  max-width: 320px;

  @media (max-width: 640px) {
    max-width: 100%;
  }
`;

export const SwitcherInput = styled.input`
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  color: #1e293b;
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  outline: none;

  &::placeholder {
    color: #94a3b8;
  }
  &:focus {
    border-color: #2563eb;
    background-color: white;
  }
`;

export const SwitcherDropdown = styled.ul`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 20;
  max-height: 260px;
  overflow-y: auto;
  background-color: white;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  padding: 0.25rem;
`;

export const SwitcherItem = styled.li<{ isActive?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  font-size: 0.875rem;
  color: #1e293b;
  border-radius: 0.375rem;
  cursor: pointer;
  background-color: ${({ isActive }) => (isActive ? "#eff6ff" : "transparent")};

  &:hover {
    background-color: #eff6ff;
  }

  span.num {
    color: #94a3b8;
    font-size: 0.8125rem;
    font-weight: 600;
  }
`;

export const SwitcherEmpty = styled.li`
  padding: 0.5rem 0.625rem;
  font-size: 0.875rem;
  color: #94a3b8;
`;

/* 능력치 카드 공유 버튼 */
export const ShareButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  margin: 0 0 1.5rem;
  padding: 0.625rem 1rem;
  font-size: 0.9375rem;
  font-weight: 600;
  color: white;
  background-color: #2563eb;
  border: none;
  border-radius: 0.625rem;
  cursor: pointer;

  &:hover {
    background-color: #1d4ed8;
  }
  &:disabled {
    opacity: 0.6;
    cursor: default;
  }

  @media (max-width: 640px) {
    width: 100%;
    justify-content: center;
    margin-bottom: 1rem;
  }
`;
