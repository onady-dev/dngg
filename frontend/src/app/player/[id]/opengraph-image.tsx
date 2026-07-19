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

const R_RATIO = 0.3; // 폴리곤 반경 비율 (라벨 공간 확보 위해 작게)
const LABEL_RATIO = 0.3 * 1.34; // 라벨 링 반경 비율

// i번째 축 각도(12시 시작, 시계방향)
const axisAngle = (i: number, n: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;

// 각 축 라벨의 중심 좌표(RADAR_BOX 좌표계)
function labelPositions(n: number, box: number): { x: number; y: number }[] {
  const c = box / 2;
  const rl = box * LABEL_RATIO;
  return Array.from({ length: n }, (_, i) => ({
    x: c + rl * Math.cos(axisAngle(i, n)),
    y: c + rl * Math.sin(axisAngle(i, n)),
  }));
}

// 레이더 도형만(텍스트 없음) SVG 문자열로 생성 → data URI로 <img> 삽입.
// 텍스트가 없으므로 SVG 래스터화에 한글 폰트가 필요 없다.
function radarSvg(scores: number[], px: number): string {
  const n = scores.length;
  const cx = px / 2;
  const cy = px / 2;
  const r = px * R_RATIO;
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
