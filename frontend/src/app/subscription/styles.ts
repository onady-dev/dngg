import styled from "styled-components";

export const Container = styled.div`
  max-width: 480px;
  margin: calc(var(--header-height) + 28px) auto 0;
  padding: 0 1rem 3rem;
`;

export const Card = styled.div`
  background: white;
  border: 1px solid var(--border-color);
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  margin-bottom: 1rem;
`;

export const Title = styled.h2`
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 1rem;
`;

export const StatusLine = styled.p`
  font-size: 0.95rem;
  color: #374151;
  margin-bottom: 0.5rem;
`;

export const PlanRow = styled.div`
  display: flex;
  gap: 0.75rem;
  margin: 1rem 0;
`;

export const PlanButton = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: 1rem;
  border-radius: 0.5rem;
  border: 2px solid ${(p) => (p.$active ? "var(--accent-color, #2563eb)" : "#e5e7eb")};
  background: ${(p) => (p.$active ? "rgba(37,99,235,0.06)" : "white")};
  font-weight: 600;
  cursor: pointer;
`;

export const PrimaryButton = styled.button`
  width: 100%;
  padding: 0.9rem;
  border-radius: 0.5rem;
  border: none;
  background: var(--accent-color, #2563eb);
  color: white;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

export const SecondaryButton = styled.button`
  width: 100%;
  padding: 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid #d1d5db;
  background: white;
  font-weight: 600;
  cursor: pointer;
  margin-top: 0.5rem;
`;

export const PaymentItem = styled.div`
  display: flex;
  justify-content: space-between;
  padding: 0.6rem 0;
  border-bottom: 1px solid #f3f4f6;
  font-size: 0.9rem;
`;
