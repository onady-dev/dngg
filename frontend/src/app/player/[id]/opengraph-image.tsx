import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";

// 선수 능력치 공유 카드 (OG 이미지). 링크 공유 시 카카오톡/밴드 미리보기로 노출된다.
export const runtime = "nodejs";
export const alt = "선수 능력치 카드 - dn.gg";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#2563eb";
const GRID = "#dbe3ef";
const INK = "#0f172a";
const MUTED = "#64748b";

interface Axis {
  key: string;
  label: string;
  score: number | null;
  rawPerGame: number;
}

// 레이더 도형만(텍스트 없음) SVG 문자열로 생성 → data URI로 <img> 삽입.
// 텍스트가 없으므로 SVG 래스터화에 한글 폰트가 필요 없다.
function radarSvg(scores: number[], px: number): string {
  const n = scores.length;
  const cx = px / 2;
  const cy = px / 2;
  const r = px * 0.38;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, f: number) => [
    cx + r * f * Math.cos(ang(i)),
    cy + r * f * Math.sin(ang(i)),
  ];
  const rings = [0.25, 0.5, 0.75, 1]
    .map(
      (f) =>
        `<polygon points="${scores
          .map((_, i) => pt(i, f).join(","))
          .join(" ")}" fill="none" stroke="${GRID}" stroke-width="2"/>`,
    )
    .join("");
  const spokes = scores
    .map((_, i) => {
      const [x, y] = pt(i, 1);
      return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${GRID}" stroke-width="2"/>`;
    })
    .join("");
  const data = scores
    .map((s, i) => pt(i, Math.max(0, Math.min(100, s)) / 100).join(","))
    .join(" ");
  const dots = scores
    .map((s, i) => {
      const [x, y] = pt(i, Math.max(0, Math.min(100, s)) / 100);
      return `<circle cx="${x}" cy="${y}" r="6" fill="${ACCENT}"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">${rings}${spokes}<polygon points="${data}" fill="${ACCENT}" fill-opacity="0.28" stroke="${ACCENT}" stroke-width="4"/>${dots}</svg>`;
}

function dataUri(svg: string): string {
  const base64 = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
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
  const radar = scored ? radarSvg(axes.map((x) => x.score as number), 460) : null;
  const topAxes = [...axes]
    .filter((x) => x.score !== null)
    .sort((a, b) => (b.score as number) - (a.score as number))
    .slice(0, 3);

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
          border: `12px solid ${ACCENT}`,
        }}
      >
        <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 560,
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
            <div style={{ display: "flex", flexDirection: "column", marginTop: 24 }}>
              {scored ? (
                topAxes.map((x) => (
                  <div
                    key={x.key}
                    style={{ display: "flex", alignItems: "center", marginBottom: 12 }}
                  >
                    <div style={{ display: "flex", fontSize: 30, color: INK, width: 200 }}>
                      {x.label}
                    </div>
                    <div style={{ display: "flex", fontSize: 30, color: ACCENT, fontWeight: 700 }}>
                      {String(Math.round(x.score as number))}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ display: "flex", fontSize: 30, color: MUTED }}>
                  아직 능력치 기록이 부족해요
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", flex: 1, justifyContent: "center", alignItems: "center" }}>
            {radar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dataUri(radar)} width={460} height={460} alt="" />
            ) : (
              <div style={{ display: "flex", fontSize: 200 }}>🏀</div>
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
