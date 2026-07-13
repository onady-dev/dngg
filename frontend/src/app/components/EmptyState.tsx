import styled from "styled-components";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  text-align: center;
  min-height: 400px;
  color: #666;
`;

const Icon = styled.div`
  margin-bottom: 16px;
  
  svg {
    width: 48px;
    height: 48px;
    color: #999;
  }
`;

const Message = styled.p`
  font-size: 16px;
  margin: 0;
  
  @media (max-width: 768px) {
    font-size: 14px;
  }
`;

interface EmptyStateProps {
  message?: string;
}

export default function EmptyState({ message = "데이터가 없습니다." }: EmptyStateProps) {
  return (
    <Container>
      <Icon>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z" />
        </svg>
      </Icon>
      <Message>{message}</Message>
    </Container>
  );
} 