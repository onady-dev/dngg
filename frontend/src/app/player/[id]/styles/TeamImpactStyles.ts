"use client";

import styled from "styled-components";

export const Card = styled.section`
  background-color: white;
  border-radius: 1rem;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(0, 0, 0, 0.05);

  @media (max-width: 640px) {
    padding: 1rem;
    border-radius: 0.75rem;
    margin-bottom: 1rem;
  }
`;

export const CardHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
`;

export const CardTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  color: #1e293b;
`;

export const CountBadge = styled.span`
  padding: 0.125rem 0.5rem;
  background-color: #eff6ff;
  color: #1d4ed8;
  border-radius: 1rem;
  font-size: 0.75rem;
  font-weight: 600;
`;

export const Section = styled.div`
  padding: 1rem 0;
  border-top: 1px solid #f1f5f9;

  &:first-of-type {
    border-top: none;
    padding-top: 0;
  }
`;

export const SectionLabel = styled.h3`
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #94a3b8;
  margin-bottom: 0.75rem;
`;

/* 전적: 게이지 + 폼/연승 */
export const RecordRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1.25rem;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }
`;

export const GaugeWrap = styled.div`
  position: relative;
  width: 88px;
  height: 88px;
  flex-shrink: 0;
`;

export const GaugeLabel = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
`;

export const GaugeValue = styled.span`
  font-size: 1.25rem;
  font-weight: 800;
  color: #1d4ed8;
  line-height: 1;
`;

export const GaugeCaption = styled.span`
  font-size: 0.6875rem;
  color: #94a3b8;
  margin-top: 0.125rem;
`;

export const RecordMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

export const RecordLine = styled.div`
  font-size: 1rem;
  font-weight: 700;
  color: #1e293b;

  span.w {
    color: #2563eb;
  }
  span.l {
    color: #dc2626;
  }
  span.d {
    color: #64748b;
  }
`;

export const FormDots = styled.div`
  display: flex;
  gap: 0.25rem;
  align-items: center;
`;

export const Dot = styled.span<{ result: "W" | "D" | "L" }>`
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.625rem;
  font-weight: 700;
  color: white;
  background-color: ${({ result }) =>
    result === "W" ? "#2563eb" : result === "L" ? "#dc2626" : "#cbd5e1"};
`;

export const StreakText = styled.span`
  font-size: 0.8125rem;
  color: #64748b;
`;

/* 팀 득실 타일 */
export const Tiles = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.625rem;
`;

export const Tile = styled.div`
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.625rem;
  padding: 0.75rem;
  text-align: center;
`;

export const TileLabel = styled.div`
  font-size: 0.6875rem;
  color: #64748b;
  margin-bottom: 0.25rem;
`;

export const TileValue = styled.div<{ tone?: "up" | "down" | "neutral" }>`
  font-size: 1.25rem;
  font-weight: 800;
  color: ${({ tone }) =>
    tone === "up" ? "#2563eb" : tone === "down" ? "#dc2626" : "#0f172a"};

  @media (max-width: 640px) {
    font-size: 1.125rem;
  }
`;

export const ClutchLine = styled.p`
  margin-top: 0.75rem;
  font-size: 0.8125rem;
  color: #475569;

  strong {
    color: #1d4ed8;
    font-weight: 700;
  }
`;

/* 기여도 바 */
export const BarRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.625rem;

  &:last-child {
    margin-bottom: 0;
  }
`;

export const BarLabel = styled.span`
  width: 3.5rem;
  flex-shrink: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #475569;
`;

export const BarTrack = styled.div`
  flex: 1;
  height: 10px;
  background-color: #eef2f7;
  border-radius: 9999px;
  overflow: hidden;
`;

export const BarFill = styled.div<{ pct: number }>`
  height: 100%;
  width: ${({ pct }) => Math.max(0, Math.min(100, pct))}%;
  background: linear-gradient(90deg, #3b82f6, #1d4ed8);
  border-radius: 9999px;
`;

export const BarValue = styled.span`
  width: 3rem;
  flex-shrink: 0;
  text-align: right;
  font-size: 0.8125rem;
  font-weight: 700;
  color: #1e293b;
`;

/* 능력 지표 */
export const AbilityGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

export const AbilityItem = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #f1f5f9;

  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
`;

export const AbilityName = styled.span`
  font-size: 0.875rem;
  color: #475569;
`;

export const AbilityVal = styled.span`
  font-size: 0.9375rem;
  font-weight: 700;
  color: #1e293b;

  small {
    font-size: 0.75rem;
    font-weight: 500;
    color: #94a3b8;
    margin-left: 0.375rem;
  }
`;

/* 케미 리스트 */
export const MateList = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

export const MateRow = styled.li`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  font-size: 0.875rem;
`;

export const MateRank = styled.span`
  width: 1.25rem;
  height: 1.25rem;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background-color: #eff6ff;
  color: #1d4ed8;
  font-size: 0.6875rem;
  font-weight: 700;
`;

export const MateName = styled.span`
  flex: 1;
  font-weight: 600;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const MateRecord = styled.span`
  color: #64748b;
  font-size: 0.8125rem;
`;

export const MateRate = styled.span`
  font-weight: 700;
  color: #1d4ed8;
`;

export const Caption = styled.p`
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #94a3b8;
`;

export const Empty = styled.p`
  padding: 1.5rem 1rem;
  text-align: center;
  color: #94a3b8;
  font-size: 0.9375rem;
`;
