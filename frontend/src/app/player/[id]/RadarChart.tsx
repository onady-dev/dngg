"use client";

import React from "react";

interface RadarAxis {
  label: string;
  value: number; // 0~100
}

interface RadarChartProps {
  axes: RadarAxis[];
  size?: number;
}

const ACCENT = "#2563eb";
const GRID = "#e2e8f0";
const TEXT = "#475569";

export default function RadarChart({ axes, size = 280 }: RadarChartProps) {
  const n = axes.length;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.32; // 라벨 여백 확보

  // i번째 축의 각도(12시 방향 시작, 시계방향)
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const point = (i: number, frac: number) => {
    const a = angle(i);
    return [cx + radius * frac * Math.cos(a), cy + radius * frac * Math.sin(a)];
  };

  const rings = [0.25, 0.5, 0.75, 1];
  const gridPolys = rings.map((r) =>
    axes.map((_, i) => point(i, r).join(",")).join(" "),
  );
  const dataPoly = axes
    .map((ax, i) => point(i, Math.max(0, Math.min(100, ax.value)) / 100).join(","))
    .join(" ");

  const ariaLabel = axes
    .map((ax) => `${ax.label} ${Math.round(Math.max(0, Math.min(100, ax.value)))}`)
    .join(", ");

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      style={{ maxWidth: size, display: "block", margin: "0 auto" }}
      role="img"
      aria-label={`능력치: ${ariaLabel}`}
    >
      {/* 그리드 */}
      {gridPolys.map((pts, idx) => (
        <polygon key={idx} points={pts} fill="none" stroke={GRID} strokeWidth={1} />
      ))}
      {/* 축선 */}
      {axes.map((_, i) => {
        const [x, y] = point(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={GRID} strokeWidth={1} />;
      })}
      {/* 데이터 폴리곤 */}
      <polygon
        points={dataPoly}
        fill={ACCENT}
        fillOpacity={0.25}
        stroke={ACCENT}
        strokeWidth={2}
      />
      {axes.map((ax, i) => {
        const [x, y] = point(i, Math.max(0, Math.min(100, ax.value)) / 100);
        return <circle key={i} cx={x} cy={y} r={3} fill={ACCENT} />;
      })}
      {/* 라벨 + 점수 */}
      {axes.map((ax, i) => {
        const [lx, ly] = point(i, 1.18);
        const anchor = Math.abs(lx - cx) < 1 ? "middle" : lx > cx ? "start" : "end";
        return (
          <text
            key={i}
            x={lx}
            y={ly}
            textAnchor={anchor}
            dominantBaseline="middle"
            fontSize={12}
            fill={TEXT}
          >
            <tspan fontWeight={600}>{ax.label}</tspan>
            <tspan x={lx} dy={14} fill={ACCENT} fontWeight={700}>
              {Math.round(ax.value)}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}
