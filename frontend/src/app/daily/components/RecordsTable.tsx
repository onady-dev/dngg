"use client";

import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { LogItemDef, PlayerRecord } from '../types';

type SortKey = 'total' | number; // number = logitemId

interface SortState {
  key: SortKey;
  direction: 'desc' | 'asc';
}

interface Props {
  records: PlayerRecord[];
  logItems: LogItemDef[];
  loading: boolean;
}

const MEDALS = ['🥇', '🥈', '🥉'];
const RANK_COL_WIDTH = '3rem';

const RecordsTable = ({ records, logItems, loading }: Props) => {
  const [sort, setSort] = useState<SortState | null>(null);

  // 순위는 정렬 상태와 무관하게 totalScore 내림차순 기준 공동 순위(1-2-2-4)로 고정
  const rankById = useMemo(() => {
    const byTotal = [...records].sort((a, b) => b.totalScore - a.totalScore);
    const map = new Map<number, number>();
    let prevScore: number | null = null;
    let prevRank = 0;
    byTotal.forEach((record, i) => {
      const rank = record.totalScore === prevScore ? prevRank : i + 1;
      map.set(record.id, rank);
      prevScore = record.totalScore;
      prevRank = rank;
    });
    return map;
  }, [records]);

  const sorted = useMemo(() => {
    const base = [...records].sort((a, b) => b.totalScore - a.totalScore);
    if (!sort) {
      return base;
    }
    const count = (record: PlayerRecord, logitemId: number) =>
      record.logItem[logitemId]?.count || 0;
    const compare = (a: PlayerRecord, b: PlayerRecord) =>
      sort.key === 'total'
        ? a.totalScore - b.totalScore
        : count(a, sort.key as number) - count(b, sort.key as number);
    base.sort((a, b) =>
      sort.direction === 'desc' ? compare(b, a) : compare(a, b),
    );
    return base;
  }, [records, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'desc' };
      if (prev.direction === 'desc') return { key, direction: 'asc' };
      return null; // 기본 정렬(득점순)로 복귀
    });
  };

  const sortIndicator = (key: SortKey) => {
    if (!sort || sort.key !== key) return '';
    return sort.direction === 'desc' ? ' ▼' : ' ▲';
  };

  if (loading) {
    return <PlaceholderText>기록을 불러오는 중…</PlaceholderText>;
  }
  if (records.length === 0) {
    return <EmptyText>이 날짜에 기록된 선수가 없습니다.</EmptyText>;
  }

  return (
    <TableContainer>
      <Table>
        <thead>
          <tr>
            <Th isRank>#</Th>
            <Th isFirst>선수</Th>
            <Th clickable onClick={() => toggleSort('total')}>
              득점{sortIndicator('total')}
            </Th>
            {logItems.map((item) => (
              <Th key={item.id} clickable onClick={() => toggleSort(item.id)}>
                {item.name}
                {sortIndicator(item.id)}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((record) => {
            const rank = rankById.get(record.id) ?? 0;
            const topThree = rank >= 1 && rank <= 3;
            return (
              <tr key={record.id}>
                <Td isRank topThree={topThree}>
                  {topThree ? MEDALS[rank - 1] : rank}
                </Td>
                <Td isFirst topThree={topThree}>
                  <PlayerName>{record.name}</PlayerName>
                </Td>
                <Td topThree={topThree}>
                  <StatValue isPositive={record.totalScore >= 0}>
                    {record.totalScore}점
                  </StatValue>
                </Td>
                {logItems.map((item) => {
                  const count = record.logItem[item.id]?.count || 0;
                  return (
                    <Td key={item.id} topThree={topThree}>
                      <StatValue isPositive={count > 0} isNeutral={count === 0}>
                        {count > 0 ? `${count}회` : '-'}
                      </StatValue>
                    </Td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </Table>
    </TableContainer>
  );
};

const TableContainer = styled.div`
  overflow-x: auto;

  @media (max-width: 640px) {
    max-width: 100vw;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
`;

const Th = styled.th<{ isFirst?: boolean; isRank?: boolean; clickable?: boolean }>`
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
  z-index: ${(props) => (props.isFirst || props.isRank ? 2 : 1)};
  min-width: 65px;
  cursor: ${(props) => (props.clickable ? 'pointer' : 'default')};
  user-select: none;

  ${(props) =>
    props.isRank &&
    `
    left: 0;
    min-width: ${RANK_COL_WIDTH};
    width: ${RANK_COL_WIDTH};
    text-align: center;
  `}

  ${(props) =>
    props.isFirst &&
    `
    left: ${RANK_COL_WIDTH};
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

const Td = styled.td<{ isFirst?: boolean; isRank?: boolean; topThree?: boolean }>`
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  border-bottom: 1px solid #e2e8f0;
  border-right: 1px solid #e2e8f0;
  background-color: ${(props) => (props.topThree ? '#eff6ff' : 'white')};
  min-width: 65px;

  ${(props) =>
    props.isRank &&
    `
    position: sticky;
    left: 0;
    z-index: 1;
    min-width: ${RANK_COL_WIDTH};
    width: ${RANK_COL_WIDTH};
    text-align: center;
  `}

  ${(props) =>
    props.isFirst &&
    `
    position: sticky;
    left: ${RANK_COL_WIDTH};
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

const PlayerName = styled.span`
  font-weight: 500;
`;

const StatValue = styled.span<{ isPositive?: boolean; isNeutral?: boolean }>`
  font-weight: 500;
  color: ${(props) => {
    if (props.isNeutral) return '#64748b';
    return props.isPositive ? '#059669' : '#dc2626';
  }};
`;

const EmptyText = styled.p`
  padding: 3rem 0;
  text-align: center;
  font-size: 1rem;
  color: #64748b;
`;

const PlaceholderText = styled.p`
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: #64748b;
`;

export default RecordsTable;
