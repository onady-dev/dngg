"use client";

import React, { useRef, useCallback } from 'react';
import { FiMoreVertical, FiX } from 'react-icons/fi';
import styled from 'styled-components';
import { Player } from '@/types/player';

interface PlayerCardProps {
  player: Player;
  isSelected?: boolean;
  onClick?: () => void;
  onLongPress?: () => void;
  onRemove?: () => void;
}

const LONG_PRESS_MS = 500;
const TOUCH_MOVE_THRESHOLD_PX = 8;
const MOUSE_EVENT_SUPPRESSION_MS = 700;

const PlayerCard = ({ player, isSelected, onClick, onLongPress, onRemove }: PlayerCardProps) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const hasTouchMovedRef = useRef(false);
  const ignoreMouseEventsRef = useRef(false);

  const clearPressTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startPress = useCallback(() => {
    isLongPressRef.current = false;
    clearPressTimer();
    timeoutRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      onLongPress?.();
    }, LONG_PRESS_MS);
  }, [clearPressTimer, onLongPress]);

  const finishPress = useCallback(() => {
    clearPressTimer();

    // 길게 누르기가 아니었다면 일반 클릭 이벤트 실행
    if (!isLongPressRef.current) {
      onClick?.();
    }
  }, [clearPressTimer, onClick]);

  const suppressSyntheticMouseEvents = useCallback(() => {
    ignoreMouseEventsRef.current = true;
    setTimeout(() => {
      ignoreMouseEventsRef.current = false;
    }, MOUSE_EVENT_SUPPRESSION_MS);
  }, []);

  const handleMouseDown = useCallback(() => {
    if (ignoreMouseEventsRef.current) return;
    startPress();
  }, [startPress]);

  const handleMouseUp = useCallback(() => {
    if (ignoreMouseEventsRef.current) return;
    finishPress();
  }, [finishPress]);

  const handleMouseLeave = useCallback(() => {
    clearPressTimer();
  }, [clearPressTimer]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    hasTouchMovedRef.current = false;
    suppressSyntheticMouseEvents();
    startPress();
  }, [startPress, suppressSyntheticMouseEvents]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const start = touchStartRef.current;
    const touch = e.touches[0];
    if (!start || !touch || hasTouchMovedRef.current) return;

    const deltaX = Math.abs(touch.clientX - start.x);
    const deltaY = Math.abs(touch.clientY - start.y);
    if (deltaX > TOUCH_MOVE_THRESHOLD_PX || deltaY > TOUCH_MOVE_THRESHOLD_PX) {
      hasTouchMovedRef.current = true;
      clearPressTimer();
    }
  }, [clearPressTimer]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    suppressSyntheticMouseEvents();

    if (hasTouchMovedRef.current) {
      clearPressTimer();
      touchStartRef.current = null;
      hasTouchMovedRef.current = false;
      return;
    }

    e.preventDefault();
    finishPress();
    touchStartRef.current = null;
  }, [clearPressTimer, finishPress, suppressSyntheticMouseEvents]);

  const handleTouchCancel = useCallback(() => {
    clearPressTimer();
    touchStartRef.current = null;
    hasTouchMovedRef.current = false;
    suppressSyntheticMouseEvents();
  }, [clearPressTimer, suppressSyntheticMouseEvents]);

  const handleMenuClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onLongPress?.();
  }, [onLongPress]);

  return (
    <Container
      $isSelected={isSelected}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      <Number>{player.backnumber}</Number>
      <Name>{player.name}</Name>
      {onLongPress && (
        <MenuButton
          type="button"
          aria-label={`${player.name} 선수 수정/삭제`}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onLongPress?.(); }}
          onClick={handleMenuClick}
        >
          <FiMoreVertical aria-hidden="true" />
        </MenuButton>
      )}
      {onRemove && (
        <RemoveButton
          type="button"
          aria-label={`${player.name} 팀에서 제거`}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onRemove?.(); }}
          onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
        >
          <FiX aria-hidden="true" />
        </RemoveButton>
      )}
    </Container>
  );
};

const Container = styled.div<{ $isSelected?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.4rem;
  background-color: ${props => props.$isSelected ? 'var(--primary-color)' : 'white'};
  color: ${props => props.$isSelected ? 'white' : 'var(--text-color)'};
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid ${props => props.$isSelected ? 'var(--primary-color)' : 'var(--border-color)'};
  font-size: 0.875rem;
  position: relative;
  min-width: 0;

  &:hover {
    border-color: var(--primary-color);
  }

  @media (min-width: 640px) {
    gap: 0.5rem;
    padding: 0.5rem;
  }
`;

const Number = styled.span`
  font-weight: 600;
  min-width: 1.25rem;
  flex-shrink: 0;

  @media (min-width: 640px) {
    min-width: 1.5rem;
  }
`;

const Name = styled.span`
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
`;

const MenuButton = styled.button`
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.25rem;
  color: inherit;
  opacity: 0.6;
  font-size: 0.875rem;
  line-height: 1;

  &:hover {
    opacity: 1;
    background-color: rgba(0, 0, 0, 0.06);
  }

  @media (min-width: 640px) {
    width: 1.5rem;
    height: 1.5rem;
    font-size: 1rem;
  }
`;

const RemoveButton = styled.button`
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #dc2626;
  opacity: 0.65;
  font-size: 0.75rem;
  line-height: 1;

  &:hover {
    opacity: 1;
    background-color: #fee2e2;
  }

  @media (min-width: 640px) {
    width: 1.5rem;
    height: 1.5rem;
    font-size: 0.8125rem;
  }
`;

export default PlayerCard;
