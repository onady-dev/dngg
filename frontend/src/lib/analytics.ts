// 이벤트 계측의 단일 진입점 — GA4(gtag) 연결 지점.
// 제공자를 바꾸려면 이 파일만 교체하면 된다. 호출부는 track()만 알면 된다.
//
// NEXT_PUBLIC_GA_ID가 비어 있으면 모든 함수가 조용히 no-op 한다(개발 중엔 콘솔 로그).
// NEXT_PUBLIC_* 값은 빌드 시점에 번들에 박히므로 운영 이미지는 CI build-arg로 주입한다.
//
// ⚠️ PII 금지 — 이메일·이름·그룹명을 파라미터에 넣지 말 것. 그룹명은 사용자가 입력한
// 실제 팀 이름이라 식별 정보에 해당하고, GA4는 PII 전송을 계정 정지 사유로 본다.
// user_id로는 숫자 id만 보낸다.
//
// 파라미터 이름은 snake_case로 통일한다 — GA4 맞춤 측정기준이 파라미터 이름으로
// 등록되고, 표준 파라미터(page_path 등)가 전부 snake_case다.

type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: IArguments[];
    gtag?: (...args: unknown[]) => void;
  }
}

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";

export function isAnalyticsEnabled(): boolean {
  return Boolean(GA_MEASUREMENT_ID) && typeof window !== "undefined";
}

// gtag.js 스크립트가 로드되기 전에 호출돼도 유실되지 않도록 표준 스니펫과 동일한
// 큐 스텁을 직접 보장한다. React effect가 afterInteractive 스크립트보다 먼저 도는
// 경우가 있고, dataLayer는 큐라서 gtag.js가 나중에 로드되면 밀린 항목이 처리된다.
//
// push하는 값이 반드시 Arguments 객체여야 한다 — gtag.js는 Arguments일 때만 gtag
// 명령으로 해석하고, 배열을 넣으면 데이터 레이어 변수로 취급해 조용히 무시한다.
// (그래서 파라미터 없는 function 선언 + arguments를 쓴다. 화살표 함수 불가.)
function ensureGtag(): NonNullable<Window["gtag"]> | null {
  if (!isAnalyticsEnabled()) return null;
  if (!window.gtag) {
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
  }
  return window.gtag;
}

export function track(event: string, props: AnalyticsProps = {}): void {
  const gtag = ensureGtag();
  if (gtag) {
    gtag("event", event, props);
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.debug("[track]", event, props);
  }
}

export function pageview(path: string): void {
  // page_location(UTM 포함)은 gtag가 발화 시점의 document.location에서 자동으로 붙인다.
  // 그래서 useSearchParams가 필요 없다 — 자세한 이유는 AnalyticsProvider 주석 참고.
  track("page_view", { page_path: path });
}

export function setAnalyticsUser(id: string | null): void {
  const gtag = ensureGtag();
  if (!gtag) return;
  gtag("set", { user_id: id });
}
