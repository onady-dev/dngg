import React from 'react';
import styled from 'styled-components';

const Container = styled.div`
  min-height: calc(100vh - 4rem);
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Content = styled.div`
  text-align: center;
  max-width: 24rem;
  margin: 0 auto;
  padding: 2rem;
  background-color: white;
  border-radius: 0.5rem;
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
`;

const Title = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 1rem;
`;

const Text = styled.p`
  color: #64748b;
  margin-bottom: 1rem;
`;

const Arrow = styled.div`
  animation: bounce 1s infinite;
  font-size: 2.5rem;
  color: #94a3b8;

  @keyframes bounce {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-10px);
    }
  }
`;

export default function NoGroupSelected() {
  return (
    <Container>
      <Content>
        <Title>그룹을 선택해주세요</Title>
        <Text>
          상단의 그룹 선택 메뉴에서 원하는 그룹을 선택하면 해당 그룹의 정보를 볼 수 있습니다.
        </Text>
        <Arrow>↑</Arrow>
      </Content>
    </Container>
  );
} 