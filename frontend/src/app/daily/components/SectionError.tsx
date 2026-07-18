"use client";

import styled from 'styled-components';

interface Props {
  message: string;
  onRetry: () => void;
}

const SectionError = ({ message, onRetry }: Props) => (
  <ErrorBox>
    <span>{message}</span>
    <RetryButton type="button" onClick={onRetry}>
      다시 시도
    </RetryButton>
  </ErrorBox>
);

const ErrorBox = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  background-color: #fee2e2;
  padding: 0.875rem 1rem;
  margin: 0.5rem 0 1rem;
  border-radius: 0.375rem;
  color: #b91c1c;
  font-size: 0.875rem;
`;

const RetryButton = styled.button`
  flex-shrink: 0;
  padding: 0.375rem 0.75rem;
  border: 1px solid #b91c1c;
  border-radius: 0.375rem;
  background: white;
  color: #b91c1c;
  font-size: 0.8125rem;
  cursor: pointer;

  &:hover {
    background: #fef2f2;
  }
`;

export default SectionError;
