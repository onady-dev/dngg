"use client";

import styled from "styled-components";

export const HeaderContainer = styled.header`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 60px;
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
`;

export const LogoNavContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 48px;
  
  @media (max-width: 768px) {
    gap: 0;
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
    gap: 6px;

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
    gap: 8px;
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
    margin-left: 6px;
    min-width: 84px;
    max-width: 110px;
    padding: 4px 6px;
    font-size: 13px;
    text-overflow: ellipsis;
  }
`;

export const CreateGroupButton = styled.button`
  padding: 8px 16px;
  border-radius: 8px;
  background-color: #007AFF;
  color: white;
  border: none;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  
  svg {
    width: 18px;
    height: 18px;
  }
  
  &:hover {
    background-color: #0056b3;
    transform: translateY(-1px);
  }
  
  &:active {
    transform: translateY(0);
  }
  
  @media (max-width: 768px) {
    padding: 0;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    font-size: 0;
    justify-content: center;
    align-items: center;
    box-shadow: 0 2px 8px rgba(0, 122, 255, 0.25);
    position: relative;
    
    svg {
      width: 20px;
      height: 20px;
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
    }
    
    &:hover {
      background-color: #0056b3;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);
    }
    
    &:active {
      transform: translateY(0);
      box-shadow: 0 2px 6px rgba(0, 122, 255, 0.2);
    }
  }
`;

export const EmptyStateText = styled.span`
  color: #666;
  font-size: 14px;
  
  @media (max-width: 768px) {
    font-size: 12px;
  }
`;
