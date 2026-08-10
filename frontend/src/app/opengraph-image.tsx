import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";

// 루트 URL(dngg.one) 공유 카드. 카톡·밴드 링크 미리보기로 노출된다.
// 특정 팀에 속하지 않는 URL이므로 동적 데이터 없이 브랜드 카드로 고정한다.
export const runtime = "nodejs";
export const alt = "dn.gg — 동호회 농구 경기 기록·랭킹";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#2563eb";
const INK = "#0f172a";
const MUTED = "#64748b";

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

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
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
                fontSize: 64,
                fontWeight: 700,
                color: INK,
                marginTop: 24,
                lineHeight: 1.25,
              }}
            >
              <div style={{ display: "flex" }}>동호회 농구,</div>
              <div style={{ display: "flex" }}>기억이 아니라 기록으로</div>
            </div>
            <div style={{ display: "flex", fontSize: 32, color: MUTED, marginTop: 28 }}>
              터치 몇 번이면 랭킹·능력치가 자동으로
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 240 }}>🏀</div>
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
