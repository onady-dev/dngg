import styled from "styled-components";

export const Container = styled.div`
  max-width: 720px;
  margin: 0 auto;
  padding: 1.5rem 1rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`;

export const Title = styled.h1`
  font-size: 1.25rem;
  font-weight: 700;
`;

export const Card = styled.section`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1.25rem;
`;

export const CardTitle = styled.h2`
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
`;

export const StatusLine = styled.p`
  font-size: 0.9rem;
  color: #4b5563;
  margin-bottom: 0.75rem;
`;

export const DangerButton = styled.button`
  background: #dc2626;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 0.6rem 1rem;
  font-weight: 600;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  th,
  td {
    text-align: left;
    padding: 0.5rem 0.4rem;
    border-bottom: 1px solid #f3f4f6;
    white-space: nowrap;
  }
  th {
    color: #6b7280;
    font-weight: 600;
  }
`;

export const TableWrap = styled.div`
  overflow-x: auto;
`;

export const Badge = styled.span<{ $tone: "ok" | "warn" | "muted" }>`
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: ${({ $tone }) =>
    $tone === "ok" ? "#dcfce7" : $tone === "warn" ? "#fee2e2" : "#f3f4f6"};
  color: ${({ $tone }) =>
    $tone === "ok" ? "#166534" : $tone === "warn" ? "#991b1b" : "#6b7280"};
`;

export const SmallButton = styled.button`
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0.25rem 0.6rem;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  &:hover {
    background: #e5e7eb;
  }
`;

// 문의 카드 — 답변 인라인 영역
// Table의 td에 white-space: nowrap이 걸려 있어 긴 텍스트용으로 따로 푼다.
export const WrapCell = styled.td`
  white-space: normal;
`;

export const Ellipsis = styled.span`
  display: inline-block;
  max-width: 18rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
`;

export const AnswerBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 0.4rem;
  background: #f9fafb;
`;

export const AnswerArea = styled.textarea`
  width: 100%;
  min-height: 5.5rem;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.85rem;
  font-family: inherit;
  line-height: 1.5;
  resize: vertical;
`;

export const PrimaryButton = styled.button`
  align-self: flex-start;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.4rem 0.9rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  &:hover {
    background: #1d4ed8;
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
