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
//
// 토스 결제 복귀 URL(?authKey=…&customerKey=…)이 page_location으로 GA4에 흘러드는 것을 막는다.
// customerKey는 Group에 영속되는 계정별 식별자, authKey는 결제 인증 자격증명이다.
// GA4로 한 번 나간 값은 회수할 수 없어서, 자동 수집에 맡기지 않고 명시적으로 덮어쓴다.
const SENSITIVE_QUERY_KEYS = ["authKey", "customerKey", "token", "code"];

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
    // 설계 §6 불변식: track()은 void이고 throw하지 않는다. gtag.js 로드 후에는
    // window.gtag·dataLayer.push가 전부 구글 코드라 우리 제어 밖에서 던질 수 있고,
    // 호출부(예: Signup.tsx)는 이미 성공한 흐름 뒤에 있어 여기서 throw하면 잘못된
    // 실패 처리로 이어진다. 그래서 경계인 여기서 한 번만 감싼다 — 호출부는 신경 쓰지 않는다.
    try {
      gtag("event", event, props);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.debug("[track] gtag error", error);
      }
    }
    return;
  }
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.debug("[track]", event, props);
  }
}

export function pageview(path: string): void {
  // page_location(UTM 포함)은 기본적으로 gtag가 발화 시점의 document.location에서
  // 자동으로 붙는다. 그래서 useSearchParams가 필요 없다 — 자세한 이유는
  // AnalyticsProvider 주석 참고. UTM 파라미터는 SENSITIVE_QUERY_KEYS에 없으므로
  // 아래에서도 그대로 살아남는다.
  //
  // 다만 토스 결제 복귀 등 민감 쿼리 파라미터가 섞인 URL은 자동 수집에 맡기지 않고
  // page_location을 명시적으로 덮어써서 내보낸다. 이렇게 하면 gtag가 다음 클라이언트
  // 사이드 히트의 referrer로 들고 가는 값도 함께 정제된다.
  if (typeof window === "undefined") {
    track("page_view", { page_path: path });
    return;
  }
  const url = new URL(window.location.href);
  for (const key of SENSITIVE_QUERY_KEYS) {
    url.searchParams.delete(key);
  }
  track("page_view", { page_path: path, page_location: url.toString() });
}

export function setAnalyticsUser(id: string | null): void {
  const gtag = ensureGtag();
  if (!gtag) return;
  // track()과 동일한 이유로 감싼다 — 설계 §6 불변식.
  try {
    gtag("set", { user_id: id });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.debug("[setAnalyticsUser] gtag error", error);
    }
  }
}
