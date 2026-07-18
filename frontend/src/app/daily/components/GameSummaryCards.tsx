"use client";

import styled from 'styled-components';
import { GameSummary } from '../types';

interface Props {
  games: GameSummary[];
  loading: boolean;
}

const GameSummaryCards = ({ games, loading }: Props) => {
  if (loading) {
    return <PlaceholderText>경기 요약을 불러오는 중…</PlaceholderText>;
  }
  if (games.length === 0) {
    return null;
  }

  return (
    <CardsRow>
      {games.map((game) => (
        <Card key={game.id}>
          {game.status === 'IN_PROGRESS' && <Badge>진행 중</Badge>}
          <TeamRow>
            <TeamName>{game.homeTeamName || '홈'}</TeamName>
            <Score>
              {game.homeScore}
              <Colon>:</Colon>
              {game.awayScore}
            </Score>
            <TeamName>{game.awayTeamName || '어웨이'}</TeamName>
          </TeamRow>
        </Card>
      ))}
    </CardsRow>
  );
};

const CardsRow = styled.div`
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;
  margin-bottom: 1rem;
  -webkit-overflow-scrolling: touch;

  @media (min-width: 768px) {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    overflow-x: visible;
  }
`;

const Card = styled.div`
  position: relative;
  flex: 0 0 auto;
  min-width: 220px;
  padding: 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  background: white;
`;

const Badge = styled.span`
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 0.6875rem;
  font-weight: 600;
`;

const TeamRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
`;

const TeamName = styled.span`
  flex: 1;
  font-size: 0.875rem;
  font-weight: 500;
  color: #1e293b;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Score = styled.span`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
`;

const Colon = styled.span`
  color: #94a3b8;
  font-weight: 400;
`;

const PlaceholderText = styled.p`
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: #64748b;
`;

export default GameSummaryCards;
