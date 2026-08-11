import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";
import {
  ACCENT,
  INK,
  MUTED,
  SAMPLE_ABILITY,
  dataUri,
  labelPositions,
  radarSvg,
} from "@/lib/ogCard";

// 루트 URL(dngg.one) 공유 카드. 카톡·밴드 링크 미리보기로 노출된다.
// 특정 팀에 속하지 않는 URL이므로 동적 데이터 없이 브랜드 카드로 고정하되,
// 제품의 핵심 산출물인 6각 능력치 그래프를 샘플로 보여준다 — 이 카드가 하는 일은
// "무슨 서비스인지" 설명이 아니라 "쓰면 이게 나온다"를 한눈에 보이는 것이다.
export const runtime = "nodejs";
export const alt = "dn.gg — 동호회 농구 경기 기록·랭킹";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const RADAR_BOX = 380;

export default async function Image() {
  const fontDir = join(process.cwd(), "public", "fonts");
  const [regular, bold] = await Promise.all([
    readFile(join(fontDir, "Pretendard-Regular.otf")),
    readFile(join(fontDir, "Pretendard-Bold.otf")),
  ]);
  const fonts = [
    { name: "Pretendard", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Pretendard", data: bold, weight: 700 as const, style: "normal" as const },
  ];

  const radar = radarSvg(
    SAMPLE_ABILITY.map((a) => a.score),
    RADAR_BOX,
  );
  const labels = labelPositions(SAMPLE_ABILITY.length, RADAR_BOX).map((pos, i) => ({
    ...pos,
    label: SAMPLE_ABILITY[i].label,
    score: SAMPLE_ABILITY[i].score,
  }));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "#ffffff",
          fontFamily: "Pretendard",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", fontSize: 34, color: ACCENT, fontWeight: 700 }}>
              dn.gg
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontSize: 60,
                fontWeight: 700,
                color: INK,
                marginTop: 22,
                lineHeight: 1.25,
              }}
            >
              <div style={{ display: "flex" }}>동호회 농구,</div>
              <div style={{ display: "flex" }}>기억이 아니라 기록으로</div>
            </div>
            <div style={{ display: "flex", fontSize: 30, color: MUTED, marginTop: 24 }}>
              터치 몇 번이면 랭킹·능력치가 자동으로
            </div>
          </div>
          <div
            style={{
              position: "relative",
              display: "flex",
              width: RADAR_BOX,
              height: RADAR_BOX,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={dataUri(radar)} width={RADAR_BOX} height={RADAR_BOX} alt="" />
            {labels.map((l) => (
              <div
                key={l.label}
                style={{
                  position: "absolute",
                  left: l.x,
                  top: l.y,
                  transform: "translate(-50%, -50%)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", fontSize: 22, fontWeight: 700, color: INK }}>
                  {l.label}
                </div>
                <div style={{ display: "flex", fontSize: 20, fontWeight: 700, color: ACCENT }}>
                  {String(l.score)}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 28, color: MUTED }}>
            실시간 경기 기록 · 자동 랭킹 · 6각 능력치
          </div>
          <div style={{ display: "flex", fontSize: 28, color: ACCENT, fontWeight: 700 }}>
            dngg.one
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
