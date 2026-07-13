"use client";

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { api } from '@/lib/axios';
import { useGroupStore } from '@/app/stores/groupStore';
import { formatDate } from '@/utils/dateUtils';
import NoGroupSelected from '@/app/components/NoGroupSelected';
import { useMounted } from '@/app/lib/useMounted';

interface PlayerRecord {
  id: number;
  name: string;
  backnumber: number;
  totalScore: number;
  logItem: LogItem;
}

interface LogItem {
  [id: number]: {
      id: number;
      name: string;
      value: number;
      count: number;
  }
}

const DailyPage = () => {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [dateOptions, setDateOptions] = useState<string[]>([]);
  const [playerRecords, setPlayerRecords] = useState<PlayerRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [allLogItems, setAllLogItems] = useState<LogItem>({});
  const { selectedGroup } = useGroupStore();
  const mounted = useMounted();

  // 날짜 포맷 함수
  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });
  };

  // 게임이 있는 날짜 목록 가져오기
  useEffect(() => {
    const fetchGameDates = async () => {
      if (!selectedGroup) return;
      
      try {
        const response = await api.get(`/game?groupId=${selectedGroup}`);
        const raw = response.data;
        const games = Array.isArray(raw) ? raw : (raw.games ?? []);
        const data = games.filter((item: any) => item.status === "FINISHED");
        const dates = Array.from(new Set(data.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((item: any) => item.date))) as string[];
        setDateOptions(dates);

        // 데이터가 있으면 가장 최근 날짜 선택
        if (dates.length > 0) {
          setSelectedDate(dates[0]);
        }
      } catch (err) {
        console.error('게임 날짜를 불러오는데 실패했습니다:', err);
        setError('게임 날짜를 불러오는데 실패했습니다.');
      }
    };

    fetchGameDates();
  }, [selectedGroup]);

  // 로그 아이템 종류 가져오기
  useEffect(() => {
    const fetchLogItems = async () => {
      if (!selectedGroup) return;
      
      try {
        const response = await api.get('/logitem');
        const logItems = response.data;
        setAllLogItems(logItems);
      } catch (err) {
        console.error('로그 아이템을 불러오는데 실패했습니다:', err);
      }
    };

    fetchLogItems();
  }, [selectedGroup]);

  // 선택한 날짜의 플레이어 기록 가져오기
  useEffect(() => {
    const fetchDailyRecords = async () => {
      if (!selectedGroup) return;
      if (!selectedDate) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        setError(null);
        
        // 해당 날짜의 게임 조회
        const res = await api.get(`/log/daily?date=${selectedDate}`);
        const players = res.data;
        if (players.length === 0) {
          setPlayerRecords([]);
          return;
        }
        setPlayerRecords(players.sort((a: PlayerRecord, b: PlayerRecord) => b.totalScore - a.totalScore));
      } catch (err) {
        console.error('일일 기록을 불러오는데 실패했습니다:', err);
        setError('데이터를 불러오는데 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchDailyRecords();
  }, [selectedGroup, selectedDate]);

  if (!mounted) return null;

  if (!selectedGroup) {
    return <NoGroupSelected />;
  }

  if (loading) {
    return (
      <LoadingContainer>
        <LoadingSpinner />
      </LoadingContainer>
    );
  }

  if (error) {
    return <ErrorContainer>{error}</ErrorContainer>;
  }

  return (
    <Container>
      <Header>
        <Title>일일 기록</Title>
        {
          selectedDate ?
        <DateSelectContainer>
          <DateSelect
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          >
            {dateOptions.map((date) => (
              <option key={date} value={date}>
                {formatDateDisplay(date)}
              </option>
            ))}
          </DateSelect>
        </DateSelectContainer>
        : null
        }
      </Header>

      {(!selectedDate || playerRecords.length === 0) ? (
        <EmptyContainer>
          <EmptyText>기록된 게임이 없습니다.</EmptyText>
        </EmptyContainer>
      ) : (
        <TableContainer>
          <Table>
            <thead>
              <tr>
                <Th isFirst>선수</Th>
                <Th>득점</Th>
                {Object.values(allLogItems).map((item) => (
                  <Th key={item.id}>{item.name}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {playerRecords.map((record, i) => (
                <tr key={i}>
                  <Td isFirst>
                    <PlayerInfo>
                      <PlayerName>{record.name}</PlayerName>
                      {/* <PlayerNumber>#{record.backnumber || ''}</PlayerNumber> */}
                    </PlayerInfo>
                  </Td>
                  <Td>
                    <StatValue isPositive={record.totalScore >= 0}>
                      {record.totalScore}점
                    </StatValue>
                  </Td>
                  {Object.values(allLogItems).map((item) => {
                    const logItem = record.logItem[item.id];
                    const count = logItem?.count || 0;
                    return (
                      <Td key={item.id}>
                        <StatValue isPositive={count > 0} isNeutral={count === 0}>
                          {count > 0 ? `${count}회` : "-"}
                        </StatValue>
                      </Td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </Table>
        </TableContainer>
      )}
    </Container>
  );
};

// 스타일 컴포넌트
const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  margin-top: calc(var(--header-height) + 4px);
`;

const Header = styled.div`
  display: flex;
  flex-direction: column;
  margin-bottom: 1.5rem;
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
  margin-bottom: 1rem;
  
  @media (min-width: 768px) {
    margin-bottom: 0;
  }
`;

const DateSelectContainer = styled.div`
  width: 100%;
  
  @media (min-width: 768px) {
    width: auto;
    min-width: 300px;
  }
`;

const DateSelect = styled.select`
  width: 100%;
  padding: 0.625rem 1rem;
  background-color: white;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
  
  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const TableContainer = styled.div`
  overflow-x: auto;
  /* overflow-y, max-height 제거 */
  /* 모바일에서만 가로 스크롤 */
  @media (max-width: 640px) {
    max-width: 100vw;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
`;

const Th = styled.th<{ isFirst?: boolean }>`
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
      min-width: 65px;

  ${(props) =>
    props.isFirst &&
    `
    left: 0;
    background-color: #f8fafc;
    border-right: 2px solid #cbd5e1;

  `}

  &:last-child {
    border-right: none;
  }

  @media (max-width: 640px) {
    padding: 0.625rem 0.75rem;
    font-size: 0.7rem;
  }
`;

const Td = styled.td<{ isFirst?: boolean; highlight?: boolean }>`
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  border-bottom: 1px solid #e2e8f0;
  border-right: 1px solid #e2e8f0;
  background-color: ${(props) => (props.highlight ? "#f8fafc" : "white")};
  position: relative;
      min-width: 65px;

  ${(props) =>
    props.isFirst &&
    `
    position: sticky;
    left: 0;
    background-color: ${props.highlight ? "#f8fafc" : "white"};
    z-index: 1;
    border-right: 2px solid #cbd5e1;

  `}

  &:last-child {
    border-right: none;
  }

  @media (max-width: 640px) {
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
  }
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

const ErrorContainer = styled.div`
  background-color: #fee2e2;
  padding: 1rem;
  margin: 1rem 0;
  border-radius: 0.375rem;
  color: #b91c1c;
`;

const PlayerInfo = styled.div`
  display: flex;
  flex-direction: column;
`;

const PlayerName = styled.span`
  font-weight: 500;
`;

const PlayerNumber = styled.span`
  font-size: 0.75rem;
  color: #64748b;
`;

const StatValue = styled.span<{ isPositive?: boolean; isNeutral?: boolean }>`
  font-weight: 500;
  color: ${(props) => {
    if (props.isNeutral) return '#64748b';
    return props.isPositive ? '#059669' : '#dc2626';
  }};
`;

export default DailyPage;

