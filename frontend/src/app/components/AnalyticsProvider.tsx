"use client";

import { useEffect } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/app/stores/useAuthStore";
import { GA_MEASUREMENT_ID, pageview, setAnalyticsUser } from "@/lib/analytics";

// dev에서만 debug_mode를 붙인다 — GA4 DebugView가 이 플래그로 이벤트를 잡는다.
const gaConfig = JSON.stringify({
  send_page_view: false,
  ...(process.env.NODE_ENV !== "production" ? { debug_mode: true } : {}),
});

export default function AnalyticsProvider() {
  const pathname = usePathname();

  // 로그인·로그아웃·axios 401 만료가 전부 useAuthStore를 거치므로(lib/axios.ts:44)
  // 여기 한 곳만 구독하면 모든 경로가 잡힌다.
  // persist 스토어라 새로고침 시 복원된 세션도 첫 호출에서 잡힌다.
  //
  // 의도적으로 pageview effect보다 먼저 선언한다 — 같은 컴포넌트의 effect는 선언
  // 순서대로 실행되므로, 이 순서를 바꾸면 세션 진입 첫 page_view가 user_id 없이
  // 나간다(set은 소급 적용되지 않는다). 절대 아래 effect 뒤로 옮기지 말 것.
  useEffect(() => {
    setAnalyticsUser(useAuthStore.getState().user?.id ?? null);
    return useAuthStore.subscribe((state) => {
      setAnalyticsUser(state.user?.id ?? null);
    });
  }, []);

  // App Router는 라우트 변경 pageview를 자동 추적하지 않으므로 직접 쏜다.
  // config에 send_page_view: false를 줬으므로 최초 진입 pageview도 이 effect의
  // 첫 실행으로 한 번만 나간다(중복 없음).
  //
  // useSearchParams는 일부러 쓰지 않는다 — 쓰면 Suspense 경계가 강제되고 정적 렌더가
  // 깨진다. 쿼리스트링은 pageview()가 window.location에서 직접 읽으므로 공유 링크의
  // utm_* 파라미터는 최초 pageview에 그대로 담긴다(민감 키만 제거된다 — analytics.ts 참고).
  useEffect(() => {
    if (!pathname) return;
    pageview(pathname);
  }, [pathname]);

  // 측정 ID가 없으면 스크립트를 아예 붙이지 않는다 — 로컬 개발이 운영 속성을
  // 오염시키지 않는다. GA_MEASUREMENT_ID는 빌드 시점 상수라 서버/클라이언트가
  // 같은 값을 보므로 hydration 불일치가 없다.
  if (!GA_MEASUREMENT_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-config" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}', ${gaConfig});`}
      </Script>
    </>
  );
}
