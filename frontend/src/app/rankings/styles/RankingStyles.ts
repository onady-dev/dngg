"use client";

import styled from "styled-components";

export const Container = styled.div`
  max-width: 1200px;
  margin: 4rem auto 0;
  padding: 1rem;
  min-height: calc(100vh - 4rem);
  background-color: #f8fafc;

  @media (min-width: 768px) {
    padding: 1.5rem;
  }

  @media (max-width: 640px) {
    padding: 1rem 0.5rem;
  }
`;

export const Header = styled.div`
  margin-bottom: 2rem;
`;

export const GroupSelector = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    height: 4px;
  }

  &::-webkit-scrollbar-track {
    background: #f1f5f9;
    border-radius: 2px;
  }

  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 2px;
  }
`;

export const GroupButton = styled.button<{ isSelected?: boolean }>`
  padding: 0.5rem 1rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
  transition: all 0.2s;
  background-color: ${(props) => (props.isSelected ? "#2563eb" : "#fff")};
  color: ${(props) => (props.isSelected ? "#fff" : "#64748b")};
  border: 1px solid ${(props) => (props.isSelected ? "#2563eb" : "#e2e8f0")};
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

  &:hover {
    background-color: ${(props) => (props.isSelected ? "#1d4ed8" : "#f8fafc")};
  }

  @media (max-width: 640px) {
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
  }
`;

export const TabContainer = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 0.5rem;
`;

export const TabButton = styled.button<{ isSelected?: boolean }>`
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: ${(props) => (props.isSelected ? "#2563eb" : "#64748b")};
  border-bottom: 2px solid ${(props) => (props.isSelected ? "#2563eb" : "transparent")};
  transition: all 0.2s;

  &:hover {
    color: ${(props) => (props.isSelected ? "#2563eb" : "#1e293b")};
  }

  @media (max-width: 640px) {
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
  }
`;

export const RankingCard = styled.div`
  background-color: white;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(0, 0, 0, 0.05);
  margin-bottom: 1rem;

  @media (max-width: 640px) {
    border-radius: 0.75rem;
  }
`;

export const RankingHeader = styled.div<{ isExpanded?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  cursor: pointer;
  background-color: ${(props) => (props.isExpanded ? "#f8fafc" : "white")};
  border-bottom: 1px solid ${(props) => (props.isExpanded ? "#e2e8f0" : "transparent")};
  transition: all 0.2s;

  &:hover {
    background-color: #f8fafc;
  }

  @media (max-width: 640px) {
    padding: 0.875rem 1rem;
  }
`;

export const RankingTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 600;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  @media (max-width: 640px) {
    font-size: 1rem;
  }
`;

export const TopThree = styled.div`
  border-bottom: 1px solid #e2e8f0;
`;

export const RankingContent = styled.div<{ isExpanded?: boolean }>`
  display: ${(props) => (props.isExpanded ? "block" : "none")};
  padding: 0.5rem 0;
`;

export const PlayerList = styled.div`
  display: flex;
  flex-direction: column;
`;

export const PlayerItem = styled.div<{ isTop?: boolean }>`
  display: flex;
  align-items: center;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid #f1f5f9;
  transition: background-color 0.2s;
  background-color: ${(props) => (props.isTop ? "#f8fafc" : "white")};

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background-color: ${(props) => (props.isTop ? "#f1f5f9" : "#f8fafc")};
  }

  @media (max-width: 640px) {
    padding: 0.625rem 1rem;
  }
`;

export const Rank = styled.span<{ isTop?: boolean }>`
  font-size: ${(props) => (props.isTop ? "1.125rem" : "1rem")};
  font-weight: 600;
  color: ${(props) => {
    if (!props.isTop) return "#64748b";
    switch (Number(props.children)) {
      case 1:
        return "#fbbf24";
      case 2:
        return "#94a3b8";
      case 3:
        return "#b45309";
      default:
        return "#64748b";
    }
  }};
  width: 2.5rem;

  @media (max-width: 640px) {
    font-size: ${(props) => (props.isTop ? "1rem" : "0.875rem")};
    width: 2rem;
  }
`;

export const PlayerInfo = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
`;

export const PlayerName = styled.span`
  font-size: 0.9375rem;
  font-weight: 500;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  @media (max-width: 640px) {
    font-size: 0.875rem;
  }
`;

export const PlayerBadge = styled.span`
  padding: 0.25rem 0.5rem;
  background-color: #f1f5f9;
  color: #64748b;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;

  @media (max-width: 640px) {
    padding: 0.125rem 0.375rem;
    font-size: 0.6875rem;
  }
`;

export const StatValue = styled.span<{ isPositive?: boolean }>`
  font-size: 0.9375rem;
  font-weight: 600;
  color: ${(props) => (props.isPositive ? "#2563eb" : "#dc2626")};
  margin-left: auto;
  white-space: nowrap;

  @media (max-width: 640px) {
    font-size: 0.875rem;
  }
`;

export const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
  color: #64748b;
`;

export const ErrorMessage = styled.div`
  text-align: center;
  padding: 2rem;
  color: #dc2626;
  background-color: #fef2f2;
  border-radius: 0.5rem;
  margin: 1rem 0;
`;
