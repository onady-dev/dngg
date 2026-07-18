"use client";

import styled from 'styled-components';

interface Props {
  dates: string[]; // 최신순 정렬 전제
  selectedDate: string;
  onChange: (date: string) => void;
}

const formatDateDisplay = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

const DateNavigator = ({ dates, selectedDate, onChange }: Props) => {
  const index = dates.indexOf(selectedDate);
  const hasOlder = index >= 0 && index < dates.length - 1;
  const hasNewer = index > 0;

  return (
    <Nav>
      <ArrowButton
        type="button"
        disabled={!hasOlder}
        onClick={() => onChange(dates[index + 1])}
        aria-label="이전 날짜"
      >
        ◀
      </ArrowButton>
      <DateLabelWrapper>
        <DateLabel>{formatDateDisplay(selectedDate)}</DateLabel>
        {/* 라벨 위에 투명 select를 겹쳐 탭하면 네이티브 날짜 목록이 열린다 */}
        <HiddenSelect
          value={selectedDate}
          onChange={(e) => onChange(e.target.value)}
          aria-label="날짜 선택"
        >
          {dates.map((date) => (
            <option key={date} value={date}>
              {formatDateDisplay(date)}
            </option>
          ))}
        </HiddenSelect>
      </DateLabelWrapper>
      <ArrowButton
        type="button"
        disabled={!hasNewer}
        onClick={() => onChange(dates[index - 1])}
        aria-label="다음 날짜"
      >
        ▶
      </ArrowButton>
    </Nav>
  );
};

const Nav = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;

  @media (min-width: 768px) {
    width: auto;
    min-width: 320px;
  }
`;

const ArrowButton = styled.button`
  padding: 0.5rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  background: white;
  color: #475569;
  font-size: 0.875rem;
  cursor: pointer;

  &:disabled {
    color: #cbd5e1;
    cursor: default;
  }

  &:not(:disabled):hover {
    border-color: #3b82f6;
    color: #3b82f6;
  }
`;

const DateLabelWrapper = styled.div`
  position: relative;
  flex: 1;
  text-align: center;
`;

const DateLabel = styled.span`
  font-size: 0.9375rem;
  font-weight: 600;
  color: #1e293b;
`;

const HiddenSelect = styled.select`
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  cursor: pointer;
`;

export default DateNavigator;
