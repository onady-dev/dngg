"use client";

import styled from "styled-components";

export const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 5rem 1rem 2rem;
  min-height: 100vh;
  background-color: #f8fafc;

  @media (max-width: 640px) {
    padding: 4rem 0.5rem 1rem;
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
