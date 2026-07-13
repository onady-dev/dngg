"use client";

import styled, { keyframes } from "styled-components";

const bounce = keyframes`
  0%, 100% {
    transform: translateY(-25%);
    animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
  }
  50% {
    transform: translateY(0);
    animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
  }
`;

const spin = keyframes`
  to {
    transform: rotate(360deg);
  }
`;

export const Container = styled.div`
  max-width: 1200px;
  margin: 4rem auto 0;
  padding: 1rem;

  @media (min-width: 768px) {
    padding: 1.5rem;
  }
`;

export const GameList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
`;

export const GameCard = styled.div`
  background-color: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

export const GameHeader = styled.div`
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
  background-color: #f9fafb;
`;

export const GameHeaderContent = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }
`;

export const GameInfo = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 2rem;
  min-width: 0;
  flex: 1;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: center;
    width: 100%;
    gap: 0.75rem;
  }
`;

export const TitleContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
  flex: 1;

  @media (max-width: 640px) {
    width: 100%;
    align-items: center;
  }
`;

export const GameTitle = styled.h3`
  font-size: 1.1rem;
  font-weight: 600;
  color: #1f2937;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (max-width: 640px) {
    text-align: center;
    max-width: 90%;
  }
`;

export const GameDate = styled.span`
  color: #6b7280;
  font-size: 0.8rem;
  white-space: nowrap;
  font-weight: 500;

  @media (max-width: 640px) {
    text-align: center;
    margin: 0.25rem 0 0;
  }
`;

export const GameContent = styled.div`
  padding: 1.5rem;
`;

export const GameGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2rem;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

export const EmptyState = styled.div`
  text-align: center;
  padding: 4rem 0;
  color: #6b7280;
`;

export const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
`;

export const LoadingSpinner = styled.div`
  border: 4px solid #f3f3f3;
  border-top: 4px solid var(--primary-color);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
`;

export const ErrorContainer = styled.div`
  text-align: center;
  padding: 2rem;
  color: #dc2626;
`;

export const LogBadge = styled.span<{ isNegative?: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.35rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  background-color: ${(props) => (props.isNegative ? "#FEE2E2" : "#E0F2FE")};
  color: ${(props) => (props.isNegative ? "#DC2626" : "#0284C7")};

  @media (max-width: 640px) {
    font-size: 0.7rem;
    padding: 0.1rem 0.25rem;
  }
`;

export const TeamContainer = styled.div`
  margin-bottom: 1.5rem;
`;

export const TeamTitle = styled.h5`
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: var(--text-color);
`;

export const PlayerList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

export const PlayerItem = styled.div`
  padding: 1rem;
  background-color: #f8fafc;
  border-radius: 0.5rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
`;

export const PlayerName = styled.span`
  font-weight: 500;
  color: var(--text-color);
  cursor: pointer;

  &:hover {
    color: var(--primary-color);
  }
`;

export const NoPlayer = styled.p`
  color: #6b7280;
  text-align: center;
  padding: 1rem;
`;

export const GameScoreContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-left: auto;
  background-color: white;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

  @media (max-width: 640px) {
    margin: 0.25rem 0 0;
    width: 100%;
    justify-content: center;
    background-color: transparent;
    box-shadow: none;
  }
`;

export const TeamScoreWrapper = styled.div<{ result: "win" | "lose" | "draw" }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 80px;
  justify-content: center;
  color: ${(props) => {
    switch (props.result) {
      case "win":
        return "#047857";
      case "lose":
        return "#b91c1c";
      default:
        return "#4b5563";
    }
  }};
`;

export const ScoreValue = styled.span`
  font-size: 1.5rem;
  font-weight: 700;
  min-width: 1.5ch;
  text-align: center;

  @media (max-width: 640px) {
    font-size: 1.25rem;
  }
`;

export const VsText = styled.span`
  font-size: 1rem;
  font-weight: 500;
  color: #6b7280;
  margin: 0 0.25rem;

  @media (max-width: 640px) {
    font-size: 0.875rem;
  }
`;

export const ResultText = styled.span<{ result: "win" | "lose" | "draw" }>`
  font-size: 0.75rem;
  font-weight: 600;
  color: ${(props) => {
    switch (props.result) {
      case "win":
        return "#047857";
      case "lose":
        return "#b91c1c";
      default:
        return "#4b5563";
    }
  }};
  background-color: ${(props) => {
    switch (props.result) {
      case "win":
        return "#ecfdf5";
      case "lose":
        return "#fef2f2";
      default:
        return "#f3f4f6";
    }
  }};
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;

  @media (max-width: 640px) {
    font-size: 0.7rem;
  }
`;

export const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 50;
`;

export const ModalContainer = styled.div`
  background-color: white;
  border-radius: 0.5rem;
  padding: 1.5rem;
  width: 90%;
  max-width: 32rem;
  max-height: 90vh;
  overflow-y: auto;
`;

export const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
`;

export const ModalTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-color);
`;

export const CloseButton = styled.button`
  color: #6b7280;
  font-size: 1.25rem;

  &:hover {
    color: #374151;
  }
`;

export const ModalContent = styled.div`
  margin-top: 1rem;
`;

export const StatsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

export const StatItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background-color: #f8fafc;
  border-radius: 0.375rem;
`;

export const StatName = styled.span`
  color: var(--text-color);
  font-weight: 500;
`;

export const StatValue = styled.span`
  color: var(--primary-color);
  font-weight: 600;
`;

export const LogContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.35rem;

  @media (max-width: 640px) {
    gap: 0.25rem;
  }
`;

export const BadgeCount = styled.span`
  margin-left: 0.2rem;
  padding: 0.1rem 0.25rem;
  background-color: white;
  border-radius: 0.2rem;
  font-size: 0.7rem;

  @media (max-width: 640px) {
    font-size: 0.65rem;
    padding: 0.05rem 0.2rem;
    margin-left: 0.15rem;
  }
`;

export const NoGroupContainer = styled.div`
  min-height: calc(100vh - 4rem);
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const NoGroupContent = styled.div`
  text-align: center;
  max-width: 28rem;
  margin: 0 auto;
  padding: 2rem;
  background-color: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
`;

export const NoGroupTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-color);
  margin-bottom: 1rem;
`;

export const NoGroupText = styled.p`
  color: #4a5568;
  margin-bottom: 1rem;
`;

export const UpArrow = styled.div`
  font-size: 2.5rem;
  color: #a0aec0;
  animation: ${bounce} 1s infinite;
`;
