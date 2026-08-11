import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";
import {
  ACCENT,
  INK,
  MUTED,
  basketballSvg,
  dataUri,
  labelPositions,
  radarSvg,
} from "@/lib/ogCard";

// 선수 능력치 공유 카드 (OG 이미지). 링크 공유 시 카카오톡/밴드 미리보기로 노출된다.
export const runtime = "nodejs";
export const alt = "선수 능력치 카드 - dn.gg";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Axis {
  key: string;
  label: string;
  score: number | null;
  rawPerGame: number;
}

export default async function Image({ params }: { params: { id: string } }) {
  const id = params.id;
  const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3010";

  const fontDir = join(process.cwd(), "public", "fonts");
  const [regular, bold] = await Promise.all([
    readFile(join(fontDir, "Pretendard-Regular.otf")),
    readFile(join(fontDir, "Pretendard-Bold.otf")),
  ]);
  const fonts = [
    { name: "Pretendard", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Pretendard", data: bold, weight: 700 as const, style: "normal" as const },
  ];

  // 카드 데이터 (실패해도 브랜드 카드로 폴백)
  let name = "선수";
  let axes: Axis[] = [];
  let hasData = false;
  try {
    const [pRes, aRes] = await Promise.all([
      fetch(`${api}/player/${id}`, { cache: "no-store" }),
      fetch(`${api}/player/${id}/ability`, { cache: "no-store" }),
    ]);
    if (pRes.ok) name = (await pRes.json())?.name ?? name;
    if (aRes.ok) {
      const a = await aRes.json();
      axes = a?.axes ?? [];
      hasData = !!a?.hasData;
    }
  } catch {
    // 폴백 카드로 진행
  }

  const scored = hasData && axes.length >= 3 && axes.every((x) => x.score !== null);
  const RADAR_BOX = 520;
  const radar = scored ? radarSvg(axes.map((x) => x.score as number), RADAR_BOX) : null;
  const labels = scored
    ? labelPositions(axes.length, RADAR_BOX).map((pos, i) => ({
        ...pos,
        label: axes[i].label,
        score: Math.round(axes[i].score as number),
      }))
    : [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "white",
          fontFamily: "Pretendard",
          padding: 56,
        }}
      >
        <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 400,
              justifyContent: "center",
            }}
          >
            <div style={{ display: "flex", fontSize: 30, color: MUTED, fontWeight: 700 }}>
              선수 능력치
            </div>
            <div
              style={{ display: "flex", fontSize: 84, color: INK, fontWeight: 700, lineHeight: 1.1 }}
            >
              {name}
            </div>
            {!scored && (
              <div style={{ display: "flex", fontSize: 30, color: MUTED, marginTop: 20 }}>
                아직 능력치 기록이 부족해요
              </div>
            )}
          </div>
          <div style={{ display: "flex", flex: 1, justifyContent: "center", alignItems: "center" }}>
            {radar ? (
              <div style={{ position: "relative", display: "flex", width: RADAR_BOX, height: RADAR_BOX }}>
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
                    <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: INK }}>
                      {l.label}
                    </div>
                    <div style={{ display: "flex", fontSize: 22, fontWeight: 700, color: ACCENT }}>
                      {String(l.score)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={dataUri(basketballSvg(240))} width={240} height={240} alt="" />
            )}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 40, color: ACCENT, fontWeight: 700 }}>dn.gg</div>
          <div style={{ display: "flex", fontSize: 26, color: MUTED }}>
            {`dngg.one/player/${id}`}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
