"use client";

import styled from "styled-components";

export const HeaderContainer = styled.header`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--header-height);
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  z-index: 1000;
`;

export const HeaderInner = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
  height: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;

  /* 모바일: 1행(로고 + 그룹 선택) / 2행(네비게이션) 두 줄 배치 */
  @media (max-width: 768px) {
    flex-wrap: wrap;
    align-content: center;
    row-gap: 6px;
    padding: 0 12px;
  }
`;

export const LogoNavContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 48px;

  /* 모바일: 로고와 네비게이션을 HeaderInner의 직접 자식처럼 풀어서
     로고는 1행, 네비게이션은 2행으로 내린다 */
  @media (max-width: 768px) {
    display: contents;
  }
`;

export const Logo = styled.div`
  font-size: 24px;
  font-weight: bold;
  
  a {
    color: #000;
    text-decoration: none;
  }
  
  @media (max-width: 768px) {
    font-size: 20px;
  }
`;

export const Navigation = styled.nav`
  display: flex;
  gap: 32px;

  a {
    color: #666;
    text-decoration: none;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    transition: color 0.2s;

    &:hover {
      color: #000;
    }

    &[aria-disabled="true"] {
      opacity: 0.55;
    }

    svg {
      width: 20px;
      height: 20px;
      display: none;
    }
  }

  @media (max-width: 768px) {
    order: 3;
    width: 100%;
    justify-content: space-between;
    gap: 0;

    a {
      flex-direction: column;
      gap: 2px;
      font-size: 9px;
      min-width: 34px;

      svg {
        display: block;
        width: 22px;
        height: 22px;
      }
    }
  }
`;

export const GroupContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;

  @media (max-width: 768px) {
    order: 2;
    margin-left: auto;
    gap: 8px;
    min-width: 0;
  }
`;

export const GroupSelect = styled.select`
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #ddd;
  background-color: white;
  font-size: 14px;
  min-width: 140px;
  cursor: pointer;

  @media (max-width: 768px) {
    min-width: 0;
    max-width: 190px;
    padding: 5px 8px;
    font-size: 13px;
    text-overflow: ellipsis;
  }
`;

export const EmptyStateText = styled.span`
  color: #666;
  font-size: 14px;
  
  @media (max-width: 768px) {
    font-size: 12px;
  }
`;
