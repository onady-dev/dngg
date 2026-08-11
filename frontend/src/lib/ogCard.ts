// OG 카드(next/og) 공용 요소 — 색상 팔레트와 6각 능력치 레이더 렌더링.
//
// 루트 카드(app/opengraph-image.tsx)와 선수 카드(app/player/[id]/opengraph-image.tsx)가
// 같은 도형을 그린다. 기하 계산을 양쪽에 복사해두면 한쪽만 고쳐져 두 카드가 서로 다른
// 모양이 되므로 여기 한 곳에 둔다.
//
// ⚠️ next/og 제약 두 가지가 이 파일의 설계를 결정한다:
//  1. 한글은 폰트 임베드가 필수라 SVG 안에 텍스트를 넣을 수 없다(SVG 래스터화에는
//     폰트가 안 실린다). 그래서 radarSvg는 **도형만** 그리고, 축 이름은 호출부가
//     labelPositions() 좌표에 HTML div로 얹는다.
//  2. 이모지를 쓰면 렌더 시점에 cdn.jsdelivr.net(twemoji)을 fetch한다. 루트 카드는
//     정적 프리렌더라 next build가 통째로 외부 CDN에 묶인다 — 그래서 인라인 SVG만 쓴다.

export const ACCENT = "#2563eb";
export const GRID = "#dbe3ef";
export const INK = "#0f172a";
export const MUTED = "#64748b";

const R_RATIO = 0.3; // 폴리곤 반경 비율 (라벨 공간 확보 위해 작게)
const LABEL_RATIO = 0.3 * 1.34; // 라벨 링 반경 비율

// i번째 축 각도(12시 시작, 시계방향)
const axisAngle = (i: number, n: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;

// 각 축 라벨의 중심 좌표(레이더 박스 좌표계)
export function labelPositions(n: number, box: number): { x: number; y: number }[] {
  const c = box / 2;
  const rl = box * LABEL_RATIO;
  return Array.from({ length: n }, (_, i) => ({
    x: c + rl * Math.cos(axisAngle(i, n)),
    y: c + rl * Math.sin(axisAngle(i, n)),
  }));
}

// 레이더 도형만(텍스트 없음) SVG 문자열로 생성 → data URI로 <img> 삽입.
export function radarSvg(scores: number[], px: number): string {
  const n = scores.length;
  const cx = px / 2;
  const cy = px / 2;
  const r = px * R_RATIO;
  const pt = (i: number, f: number) => [
    cx + r * f * Math.cos(axisAngle(i, n)),
    cy + r * f * Math.sin(axisAngle(i, n)),
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

export function dataUri(svg: string): string {
  const base64 = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}

// 루트 카드용 샘플 능력치. 축 이름은 백엔드 ability.util.ts의 6축과 같은 순서다
// (득점력·외곽·어시스트·리바운드·수비·안정성). 실제 선수 데이터가 아니라
// "이런 게 나온다"를 보여주는 예시이므로, 한쪽으로 치우치지 않되 밋밋하지 않은 값을 쓴다.
export const SAMPLE_ABILITY: { label: string; score: number }[] = [
  { label: "득점력", score: 84 },
  { label: "외곽", score: 71 },
  { label: "어시스트", score: 63 },
  { label: "리바운드", score: 58 },
  { label: "수비", score: 76 },
  { label: "안정성", score: 68 },
];

// 능력치 데이터가 없을 때의 폴백 도형. 이모지(🏀)를 쓰면 렌더 시점에 twemoji CDN을
// fetch하므로 여기서도 인라인 SVG를 쓴다.
export function basketballSvg(px: number): string {
  const c = px / 2;
  const r = px * 0.46;
  const sw = px * 0.02;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">
    <circle cx="${c}" cy="${c}" r="${r}" fill="#f97316" stroke="${INK}" stroke-width="${sw}"/>
    <line x1="${c}" y1="${c - r}" x2="${c}" y2="${c + r}" stroke="${INK}" stroke-width="${sw}"/>
    <line x1="${c - r}" y1="${c}" x2="${c + r}" y2="${c}" stroke="${INK}" stroke-width="${sw}"/>
    <path d="M ${c - r} ${c} Q ${c} ${c - r * 0.55} ${c + r} ${c}" fill="none" stroke="${INK}" stroke-width="${sw}"/>
    <path d="M ${c - r} ${c} Q ${c} ${c + r * 0.55} ${c + r} ${c}" fill="none" stroke="${INK}" stroke-width="${sw}"/>
  </svg>`;
}
