"use client";

import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/axios';
import { useGroupStore } from '@/app/stores/groupStore';
import NoGroupSelected from '@/app/components/NoGroupSelected';
import { useMounted } from '@/app/lib/useMounted';
import DateNavigator from './components/DateNavigator';
import GameSummaryCards from './components/GameSummaryCards';
import RecordsTable from './components/RecordsTable';
import SectionError from './components/SectionError';
import { GameSummary, LogItemDef, PlayerRecord } from './types';

const DailyPage = () => {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const { selectedGroup } = useGroupStore();
  const mounted = useMounted();

  const datesQuery = useQuery<string[]>({
    queryKey: ['daily-dates', selectedGroup],
    queryFn: async () =>
      (await api.get(`/log/daily/dates?groupId=${selectedGroup}`)).data,
    enabled: mounted && !!selectedGroup,
  });

  const dates = datesQuery.data ?? [];

  // 날짜 목록 로드 후(또는 그룹 변경으로 목록이 바뀐 후) 최신 날짜를 기본 선택
  useEffect(() => {
    if (dates.length > 0 && !dates.includes(selectedDate)) {
      setSelectedDate(dates[0]);
    }
  }, [dates, selectedDate]);

  const gamesQuery = useQuery<GameSummary[]>({
    queryKey: ['daily-games', selectedGroup, selectedDate],
    queryFn: async () =>
      (
        await api.get(
          `/log/daily/games?date=${selectedDate}&groupId=${selectedGroup}`,
        )
      ).data,
    enabled: mounted && !!selectedGroup && !!selectedDate,
  });

  const recordsQuery = useQuery<PlayerRecord[]>({
    queryKey: ['daily-records', selectedGroup, selectedDate],
    queryFn: async () =>
      (
        await api.get(
          `/log/daily?date=${selectedDate}&groupId=${selectedGroup}`,
        )
      ).data,
    enabled: mounted && !!selectedGroup && !!selectedDate,
  });

  const logitemsQuery = useQuery<LogItemDef[]>({
    queryKey: ['logitems', selectedGroup],
    queryFn: async () =>
      (await api.get(`/logitem?groupId=${selectedGroup}`)).data,
    enabled: mounted && !!selectedGroup,
  });

  if (!mounted) return null;

  if (!selectedGroup) {
    return <NoGroupSelected />;
  }

  if (datesQuery.isLoading) {
    return (
      <LoadingContainer>
        <LoadingSpinner />
      </LoadingContainer>
    );
  }

  if (datesQuery.isError) {
    return (
      <Container>
        <Title>일일 기록</Title>
        <SectionError
          message="날짜 목록을 불러오는데 실패했습니다."
          onRetry={() => datesQuery.refetch()}
        />
      </Container>
    );
  }

  if (dates.length === 0) {
    return (
      <Container>
        <Title>일일 기록</Title>
        <EmptyContainer>
          <EmptyText>기록된 게임이 없습니다.</EmptyText>
        </EmptyContainer>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>일일 기록</Title>
        {selectedDate && (
          <DateNavigator
            dates={dates}
            selectedDate={selectedDate}
            onChange={setSelectedDate}
          />
        )}
      </Header>

      {gamesQuery.isError ? (
        <SectionError
          message="경기 요약을 불러오는데 실패했습니다."
          onRetry={() => gamesQuery.refetch()}
        />
      ) : (
        <GameSummaryCards
          games={gamesQuery.data ?? []}
          loading={gamesQuery.isLoading}
        />
      )}

      {recordsQuery.isError ? (
        <SectionError
          message="선수 기록을 불러오는데 실패했습니다."
          onRetry={() => recordsQuery.refetch()}
        />
      ) : (
        <RecordsTable
          records={recordsQuery.data ?? []}
          logItems={logitemsQuery.data ?? []}
          loading={recordsQuery.isLoading || logitemsQuery.isLoading}
        />
      )}
    </Container>
  );
};

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  margin-top: calc(var(--header-height) + 4px);
`;

const Header = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  position: sticky;
  top: 0;
  z-index: 10;
  background: white;
  padding-top: 1rem;

  @media (min-width: 768px) {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding-top: 0;
  }
`;

const Title = styled.h1`
  font-size: 1.5rem;
  font-weight: 600;
`;

const EmptyContainer = styled.div`
  padding: 3rem 0;
  text-align: center;
`;

const EmptyText = styled.p`
  font-size: 1rem;
  color: #64748b;
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 3rem 0;
`;

const LoadingSpinner = styled.div`
  width: 2.5rem;
  height: 2.5rem;
  border: 4px solid rgba(59, 130, 246, 0.1);
  border-left-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

export default DailyPage;
