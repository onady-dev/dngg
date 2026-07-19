// 이벤트 계측의 단일 진입점.
// 실제 제공자(GA4/Amplitude/자체 수집 엔드포인트) 연결은 여기 한 곳만 바꾸면 된다.
// NEXT_PUBLIC_ANALYTICS_URL이 설정돼 있으면 sendBeacon으로 그 수집기에 보내고,
// 없으면 개발 중 콘솔로만 남긴다(코드 변경 없이 실계측 전환 가능).

type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

export function track(event: string, props: AnalyticsProps = {}): void {
  const payload = {
    event,
    props,
    ts: Date.now(),
    path: typeof location !== "undefined" ? location.pathname : "",
  };

  const endpoint = process.env.NEXT_PUBLIC_ANALYTICS_URL;
  if (endpoint && typeof navigator !== "undefined" && navigator.sendBeacon) {
    try {
      navigator.sendBeacon(endpoint, JSON.stringify(payload));
      return;
    } catch {
      // 전송 실패 시 아래 콘솔 폴백
    }
  }

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.debug("[track]", event, props);
  }
}
