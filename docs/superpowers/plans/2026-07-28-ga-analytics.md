# GA4 계측 도입 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dngg 프론트엔드에 GA4를 연결해 `page_view`·`sign_up`·`share_click` 세 이벤트와 로그인 사용자 `user_id`를 수집한다.

**Architecture:** 의존성 없이 `next/script`로 gtag.js를 직접 싣고, 기존 `src/lib/analytics.ts`의 `track()` 추상화 뒤에 GA4를 꽂는다. App Router는 라우트 변경 pageview를 자동 추적하지 않으므로 `usePathname()` 기반으로 직접 발화한다. 사용자 식별은 `useAuthStore` 구독 한 곳으로 처리한다 — 로그인·로그아웃·axios 401 만료가 전부 이 스토어를 거치기 때문이다.

**Tech Stack:** Next.js 14.1 App Router, TypeScript, zustand(persist), next/script, GA4 gtag.js

**설계 문서:** `docs/superpowers/specs/2026-07-28-ga-analytics-design.md`

## Global Constraints

- **테스트 러너가 없다.** `frontend/package.json` scripts는 `dev`/`build`/`start`/`lint`뿐이다. 설계에서 GA 한 건 때문에 Jest/Vitest를 들이지 않기로 확정했다. 각 태스크의 검증 게이트는 `pnpm build`와 수동 브라우저 스모크다.
- **`pnpm lint`를 쓰지 말 것.** 이 저장소에는 `eslint.config.mjs`(flat config)만 있고 Next 14.1의 `next lint`는 `.eslintrc*`를 찾는다. 실행하면 대화형 설정 마법사가 떠서 자동 실행이 멈춘다.
- **파라미터 이름은 snake_case.** GA4 맞춤 측정기준이 파라미터 이름으로 등록되고 표준 파라미터(`page_path` 등)가 전부 snake_case다.
- **PII 금지.** 이메일·이름·그룹명을 이벤트 파라미터에 절대 넣지 않는다. `user_id`는 숫자 id만.
- **`NEXT_PUBLIC_*`는 빌드 시점에 번들에 박힌다.** 서버 `.env`만 바꿔도 효과가 없다.
- **`main`에 푸시하면 즉시 운영 배포된다.** Task 5 전까지 푸시하지 않는다.
- **커밋 메시지 설명은 한글**, conventional 타입 접두어(`feat:`/`fix:`/`docs:`)는 영문.
- 경로 별칭은 `@/*` → `./src/*` (`tsconfig.json`).

---

## File Structure

| 파일 | 상태 | 책임 |
|---|---|---|
| `frontend/src/lib/analytics.ts` | 수정 | GA4 전송 계층. dataLayer 큐 보장, `track`/`pageview`/`setAnalyticsUser` |
| `frontend/src/app/components/AnalyticsProvider.tsx` | 신규 | gtag 스크립트 렌더 + pageview 발화 + user_id 동기화 |
| `frontend/src/app/layout.tsx` | 수정 | 프로바이더 마운트 |
| `frontend/src/app/components/Signup.tsx` | 수정 | `sign_up` 발화 |
| `frontend/src/app/player/[id]/ShareButton.tsx` | 수정 | 파라미터 키 snake_case 정리 |
| `frontend/.env.example` | 수정 | `NEXT_PUBLIC_GA_ID` 템플릿 |
| `frontend/Dockerfile` | 수정 | 빌드 시점 주입 ARG/ENV |
| `.github/workflows/deploy.yml` | 수정 | frontend 잡 build-args |
| `handoff.md`, `docs/featurelist.md` | 수정 | 완료 처리 + 후속 TODO |

---

### Task 1: `analytics.ts`를 GA4 전송 계층으로 교체

**Files:**
- Modify: `frontend/src/lib/analytics.ts` (전체 교체)

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `GA_MEASUREMENT_ID: string`
  - `isAnalyticsEnabled(): boolean`
  - `track(event: string, props?: AnalyticsProps): void` — **시그니처 불변**
  - `pageview(path: string): void`
  - `setAnalyticsUser(id: string | null): void`
  - `AnalyticsProps = Record<string, string | number | boolean | null | undefined>` (미export, 내부 타입)

- [ ] **Step 1: 현재 파일과 유일한 호출부를 확인한다**

Run:
```bash
cd /Users/onady/project/dngg/frontend && grep -rn "from \"@/lib/analytics\"\|from '@/lib/analytics'" src
```
Expected: `src/app/player/[id]/ShareButton.tsx:4` 한 줄만 나온다. 다른 파일이 나오면 멈추고 보고할 것 — 설계 전제가 깨진 것이다.

- [ ] **Step 2: `analytics.ts`를 아래 내용으로 전체 교체한다**

기존 `NEXT_PUBLIC_ANALYTICS_URL` sendBeacon 분기는 제거한다(자체 수집기 계획 없음).

```ts
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
```

- [ ] **Step 3: 타입 체크로 검증한다**

Run:
```bash
cd /Users/onady/project/dngg/frontend && npx tsc --noEmit; echo "exit=$?"
```
Expected: `exit=0`, 출력 없음. (`ShareButton`이 여전히 컴파일된다 = `track()` 시그니처가 안 깨졌다는 뜻)

- [ ] **Step 4: 커밋**

```bash
cd /Users/onady/project/dngg
git add frontend/src/lib/analytics.ts
git commit -m "feat: analytics.ts를 GA4 gtag 전송 계층으로 교체

track() 시그니처는 유지한 채 내부 전송만 gtag('event')로 바꿨다.
gtag.js 로드 전 호출이 유실되지 않도록 dataLayer 큐 스텁을 직접 보장한다.
사용처가 없던 NEXT_PUBLIC_ANALYTICS_URL sendBeacon 분기는 제거했다."
```

---

### Task 2: `AnalyticsProvider` 추가 및 layout 연결

**Files:**
- Create: `frontend/src/app/components/AnalyticsProvider.tsx`
- Modify: `frontend/src/app/layout.tsx`

**Interfaces:**
- Consumes: Task 1의 `GA_MEASUREMENT_ID`, `pageview(path)`, `setAnalyticsUser(id)`. 그리고 기존 `useAuthStore`(`@/app/stores/useAuthStore`)의 `user: { id: string; ... } | null`.
- Produces: `export default function AnalyticsProvider(): JSX.Element | null`

- [ ] **Step 1: `AnalyticsProvider.tsx`를 생성한다**

```tsx
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

  // App Router는 라우트 변경 pageview를 자동 추적하지 않으므로 직접 쏜다.
  // config에 send_page_view: false를 줬으므로 최초 진입 pageview도 이 effect의
  // 첫 실행으로 한 번만 나간다(중복 없음).
  //
  // useSearchParams는 일부러 쓰지 않는다 — 쓰면 Suspense 경계가 강제되고 정적 렌더가
  // 깨진다. 쿼리스트링(UTM)은 gtag가 document.location에서 자동으로 읽으므로
  // 공유 링크의 utm_* 파라미터는 최초 pageview에 그대로 담긴다.
  useEffect(() => {
    if (!pathname) return;
    pageview(pathname);
  }, [pathname]);

  // 로그인·로그아웃·axios 401 만료가 전부 useAuthStore를 거치므로(lib/axios.ts:44)
  // 여기 한 곳만 구독하면 모든 경로가 잡힌다.
  // persist 스토어라 새로고침 시 복원된 세션도 첫 호출에서 잡힌다.
  useEffect(() => {
    setAnalyticsUser(useAuthStore.getState().user?.id ?? null);
    return useAuthStore.subscribe((state) => {
      setAnalyticsUser(state.user?.id ?? null);
    });
  }, []);

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
```

- [ ] **Step 2: `layout.tsx`에 import를 추가한다**

`frontend/src/app/layout.tsx`의 import 블록 마지막 줄(`import { Providers } from "./providers";`) 바로 다음에 추가:

```tsx
import AnalyticsProvider from "./components/AnalyticsProvider";
```

- [ ] **Step 3: `layout.tsx`의 `<body>` 최하단에 마운트한다**

`</Providers>` 닫는 태그 바로 다음, `</body>` 앞에 넣는다. 최종 형태:

```tsx
      <body className={inter.className}>
        <Providers>
          <StyledComponentsRegistry>
            <GlobalStyles />
            <ToastProvider>
              <ConfirmProvider>
                <Header />
                <main>{children}</main>
                <InstallPrompt />
              </ConfirmProvider>
            </ToastProvider>
          </StyledComponentsRegistry>
        </Providers>
        <AnalyticsProvider />
      </body>
```

- [ ] **Step 4: 측정 ID를 넣은 상태로 빌드해 정적 렌더가 유지되는지 확인한다**

Run:
```bash
cd /Users/onady/project/dngg/frontend && NEXT_PUBLIC_GA_ID=G-TEST123456 npx next build 2>&1 | tail -25
```
Expected: 빌드 성공. 라우트 표에서 `/`, `/admin`, `/daily`, `/games`, `/inquiry`, `/rankings`, `/settings`, `/subscription`, `/teams`가 **`○` (Static)** 으로 남아 있어야 한다. 이 중 하나라도 `λ`로 바뀌었다면 `useSearchParams`가 어딘가 섞여 들어간 것이다 — 멈추고 보고할 것.

- [ ] **Step 5: 측정 ID 없이도 빌드되는지 확인한다**

Run:
```bash
cd /Users/onady/project/dngg/frontend && npx next build 2>&1 | tail -5
```
Expected: 빌드 성공. (운영 variable 등록 전에 CI가 돌아도 안 깨진다는 확인)

- [ ] **Step 6: 커밋**

```bash
cd /Users/onady/project/dngg
git add frontend/src/app/components/AnalyticsProvider.tsx frontend/src/app/layout.tsx
git commit -m "feat: GA4 스크립트 로딩과 라우트 변경 pageview 계측 추가

App Router는 라우트 변경 pageview를 자동 추적하지 않아 usePathname으로 직접 쏜다.
useSearchParams는 Suspense 경계를 강제하고 정적 렌더를 깨서 쓰지 않았다 —
UTM은 gtag가 document.location에서 읽는다.
로그인/로그아웃/401 만료가 모두 useAuthStore를 거치므로 user_id는 스토어 구독
한 곳에서 동기화한다. 측정 ID가 없으면 스크립트를 붙이지 않는다."
```

---

### Task 3: `sign_up` 이벤트 추가 및 `share_click` 파라미터 정리

**Files:**
- Modify: `frontend/src/app/components/Signup.tsx`
- Modify: `frontend/src/app/player/[id]/ShareButton.tsx`

**Interfaces:**
- Consumes: Task 1의 `track(event, props)`
- Produces: 없음 (계측 호출부)

- [ ] **Step 1: `Signup.tsx`에 import를 추가한다**

`frontend/src/app/components/Signup.tsx` 상단, `import { api } from "@/lib/axios";` 다음 줄에 추가:

```tsx
import { track } from "@/lib/analytics";
```

- [ ] **Step 2: 가입 성공 직후 `sign_up`을 발화한다**

`Signup.tsx`의 `handleSignup` 안, `await api.post(...)` 성공 직후 `showToast` 앞에 한 줄을 넣는다. 최종 형태:

```tsx
      await api.post(`/user`, {
        email: verifiedEmail,
        password,
        name,
        groupName,
        verificationToken,
      });
      // 이 요청이 트랜잭션 안에서 그룹도 하나 만든다(user.service.ts) —
      // sign_up 수 = 신규 그룹 수라서 group_created를 따로 두지 않는다.
      // ⚠️ groupName·name·email은 PII라 파라미터에 넣지 않는다.
      track("sign_up", { method: "email" });
      showToast("회원가입이 완료되었습니다. 로그인해주세요.", "success");
```

- [ ] **Step 3: `ShareButton.tsx`의 파라미터 키를 snake_case로 바꾼다**

`frontend/src/app/player/[id]/ShareButton.tsx`에서 `track("share_click", { playerId, ... })` 세 곳을 `player_id: playerId`로 바꾼다. 최종 형태:

```tsx
      if (navigator.share) {
        await navigator.share({ url });
        track("share_click", { player_id: playerId, method: "web_share_link" });
        return;
      }

      // 폴백: 링크를 클립보드에 복사
      await navigator.clipboard.writeText(url);
      showGlobalToast("링크를 복사했어요. 붙여넣으면 카드 미리보기가 떠요.", "success");
      track("share_click", { player_id: playerId, method: "copy_link" });
    } catch (e) {
      // 사용자가 공유 시트를 취소하면 AbortError → 조용히 무시
      if ((e as { name?: string })?.name !== "AbortError") {
        showGlobalToast("공유에 실패했어요. 잠시 후 다시 시도해주세요.", "error");
        track("share_click", { player_id: playerId, method: "error" });
      }
    } finally {
```

- [ ] **Step 4: camelCase 파라미터가 남아 있지 않은지 확인한다**

Run:
```bash
cd /Users/onady/project/dngg/frontend && grep -rn "track(" src --include="*.tsx"
```
Expected: 4줄이 나오고 전부 snake_case 키(`player_id`, `method`)만 쓴다. `playerId,`(속기 축약형)가 남아 있으면 안 된다.

- [ ] **Step 5: 빌드로 검증한다**

Run:
```bash
cd /Users/onady/project/dngg/frontend && npx next build 2>&1 | tail -5
```
Expected: 빌드 성공.

- [ ] **Step 6: 커밋**

```bash
cd /Users/onady/project/dngg
git add frontend/src/app/components/Signup.tsx "frontend/src/app/player/[id]/ShareButton.tsx"
git commit -m "feat: sign_up 이벤트 계측 추가 및 share_click 파라미터 snake_case 정리

가입이 곧 그룹 생성이라 sign_up 하나로 신규 그룹 수를 센다.
GA4 맞춤 측정기준은 파라미터 이름으로 등록되므로 playerId를 player_id로 바꿨다."
```

---

### Task 4: 측정 ID 빌드 시점 주입 경로

**Files:**
- Modify: `frontend/.env.example`
- Modify: `frontend/Dockerfile`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: Task 1의 `GA_MEASUREMENT_ID`가 읽는 `process.env.NEXT_PUBLIC_GA_ID`
- Produces: 없음 (설정 배선)

`frontend/.env.dev`는 git에 추적되지 않는 로컬 파일이므로 건드리지 않는다 (`git ls-files frontend/ | grep env` → `.env.example`만 나온다).

- [ ] **Step 1: `.env.example`에 항목을 추가한다**

`frontend/.env.example` 맨 아래에 추가:

```
# GA4 측정 ID (G-XXXXXXXXXX). 비워두면 계측이 완전히 꺼진다 — 로컬 기본값.
# 로컬에서 GA4 DebugView로 확인할 때만 테스트용 속성 ID를 넣는다.
# 운영 값은 GitHub repo Variables의 NEXT_PUBLIC_GA_ID에서 CI가 build-arg로 주입한다.
NEXT_PUBLIC_GA_ID=
```

- [ ] **Step 2: `Dockerfile`에 ARG/ENV를 추가한다**

`frontend/Dockerfile`의 `NEXT_PUBLIC_TOSS_CLIENT_KEY` 블록 바로 다음, `RUN pnpm run build` 앞에 추가:

```dockerfile
# GA4 측정 ID도 빌드 시점에 박힌다. 값이 비면 계측 스크립트가 아예 주입되지 않으므로
# 운영 계측이 조용히 꺼진다 — repo variable 등록을 먼저 하고 프론트를 재빌드할 것.
ARG NEXT_PUBLIC_GA_ID
ENV NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID
```

- [ ] **Step 3: `deploy.yml`의 frontend 잡 build-args에 추가한다**

`.github/workflows/deploy.yml`의 frontend 잡 `build-args` 블록(현재 `NEXT_PUBLIC_API_URL`·`NEXT_PUBLIC_TOSS_CLIENT_KEY` 두 줄)에 한 줄을 더한다. 최종 형태:

```yaml
          build-args: |
            NEXT_PUBLIC_API_URL=${{ vars.NEXT_PUBLIC_API_URL || 'https://dngg.one/api' }}
            NEXT_PUBLIC_TOSS_CLIENT_KEY=${{ vars.NEXT_PUBLIC_TOSS_CLIENT_KEY }}
            NEXT_PUBLIC_GA_ID=${{ vars.NEXT_PUBLIC_GA_ID }}
```

Secret이 아니라 **Variable**이다 — 측정 ID는 번들과 HTML에 그대로 노출되는 공개 값이고, Secret으로 넣으면 로그 마스킹만 지저분해진다.

- [ ] **Step 4: 도커 빌드로 주입 경로를 검증한다**

Docker 데몬이 떠 있어야 한다(Mac은 `colima start`). 데몬을 띄울 수 없으면 이 스텝은 건너뛰고 Task 5의 운영 스모크에서 확인한다 — 건너뛰었다는 사실을 보고할 것.

Run:
```bash
cd /Users/onady/project/dngg/frontend && docker build --build-arg NEXT_PUBLIC_GA_ID=G-TEST123456 -t dngg-frontend:ga-check . 2>&1 | tail -15
```
Expected: 빌드 성공.

측정 ID가 번들에 실제로 박혔는지 확인:
```bash
docker run --rm dngg-frontend:ga-check sh -c "grep -rl 'G-TEST123456' .next/static | head -3"
```
Expected: `.next/static/chunks/` 아래 파일이 최소 하나 나온다. 아무것도 안 나오면 주입 경로가 끊긴 것이다.

정리:
```bash
docker rmi dngg-frontend:ga-check
```

- [ ] **Step 5: 커밋**

```bash
cd /Users/onady/project/dngg
git add frontend/.env.example frontend/Dockerfile .github/workflows/deploy.yml
git commit -m "chore: GA4 측정 ID 빌드 시점 주입 경로 추가

NEXT_PUBLIC_* 값은 빌드 시점에 번들에 박히므로 .env.example / Dockerfile ARG /
CI build-args 세 곳을 함께 배선한다. 운영 값은 repo variable에서 주입한다."
```

---

### Task 5: 로컬 DebugView 검증 → 문서 갱신 → 배포 → 운영 스모크

**Files:**
- Modify: `handoff.md`
- Modify: `docs/featurelist.md`

**Interfaces:**
- Consumes: Task 1~4의 전체 결과물
- Produces: 없음 (릴리스)

이 태스크는 사람의 개입이 필요하다. GA4 콘솔 작업과 GitHub repo Variables 등록은 에이전트가 대신할 수 없다.

- [ ] **Step 1: (사람) GA4 속성과 웹 데이터 스트림을 만든다**

GA4 콘솔 → 관리 → 속성 만들기 → 데이터 스트림 → 웹 → URL `https://dngg.one`.
측정 ID `G-XXXXXXXXXX`를 확보한다.

동시에 두 가지를 지금 처리한다:
- **데이터 보관 기간을 2개월 → 14개월로 변경** (관리 → 데이터 설정 → 데이터 보관). 소급 적용되지 않으므로 나중에 바꾸면 그 사이 데이터를 잃는다.
- 내부 트래픽 필터로 개발자 IP 제외 (선택).

- [ ] **Step 2: (사람) GitHub repo Variables에 등록한다**

Settings → Secrets and variables → Actions → **Variables** 탭 → New repository variable
이름 `NEXT_PUBLIC_GA_ID`, 값 `G-XXXXXXXXXX`.

**이 등록이 코드 푸시보다 먼저다.** 값이 빌드 시점에 박히는데, 나중에 등록하면 CI 경로 필터상 `frontend/**`가 안 바뀌는 한 프론트 잡이 돌지 않아 아무 일도 일어나지 않는다.

- [ ] **Step 3: 로컬 DebugView로 이벤트 3종을 확인한다**

로컬 `frontend/.env.development`에 측정 ID를 추가한다(이 파일은 git에 없다):

```
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

Run:
```bash
cd /Users/onady/project/dngg/frontend && pnpm dev
```

브라우저에서 `http://localhost:3011` 접속 후 GA4 콘솔 → 관리 → **DebugView**에서 확인:

1. `page_view`가 `page_path`와 함께 들어온다. 다른 메뉴로 이동하면 **또 한 번** 들어온다(라우트 변경 추적 확인).

   ⚠️ **dev에서는 이벤트가 두 번씩 찍히는 게 정상이다.** `next.config.mjs`에 `reactStrictMode: true`가 켜져 있어 React 18이 effect를 마운트→언마운트→재마운트한다. **개발 모드 전용 현상이고 운영 빌드에는 없다** — 중복으로 오판하지 말 것. 진짜 중복 여부는 Step 10의 운영 스모크에서 판단한다.
2. 로그인하면 이후 이벤트에 `user_id`가 붙는다. 로그아웃하면 떨어진다.
3. 선수 상세에서 공유 버튼 → `share_click`이 `player_id`·`method`와 함께 들어온다.
4. (선택) 새 계정으로 가입 → `sign_up`. 실제 인증 메일이 나가므로 부담되면 운영 스모크로 미룬다.

- [ ] **Step 4: 측정 ID가 없을 때 완전히 꺼지는지 확인한다**

`.env.development`에서 `NEXT_PUBLIC_GA_ID` 줄을 지우고 dev 서버를 재시작한다.

브라우저 개발자도구에서 확인:
- Network 탭에 `googletagmanager.com` 요청이 **0건**
- Elements에서 `ga-config` 스크립트 태그가 **없음**
- Console에 `[track] page_view {page_path: "/"}` 형태의 debug 로그가 보임

확인 후 `.env.development`에 측정 ID를 다시 넣을지는 자유다(로컬 이벤트가 운영 속성에 섞이므로 빼두는 쪽을 권한다).

- [ ] **Step 5: `handoff.md`를 갱신한다**

"완료" 섹션에 항목을 추가한다 — 문의·피드백 섹션 다음:

```markdown
### 완료 — GA4 계측 (배포됨)

`page_view`·`sign_up`·`share_click` 세 이벤트와 로그인 사용자 `user_id`를 수집한다.
마케팅 Phase 0의 계측 항목(`docs/superpowers/plans/2026-07-19-marketing-phase0.md` E절).

- 설계: `docs/superpowers/specs/2026-07-28-ga-analytics-design.md`
- 계획: `docs/superpowers/plans/2026-07-28-ga-analytics.md`

알아야 할 것 세 가지:

1. **측정 ID는 빌드 시점에 박힌다.** GitHub repo **Variables**(Secret 아님)의
   `NEXT_PUBLIC_GA_ID` → CI build-arg → Dockerfile ARG. 값을 바꾸면 프론트
   이미지를 재빌드해야 하고, `frontend/**` 변경 없이 variable만 고치면 아무 일도
   일어나지 않는다.
2. **측정 ID가 비면 계측이 통째로 꺼진다** — 스크립트를 아예 붙이지 않는다.
   로컬 오염 방지 장치지만, 운영에서 variable이 빠지면 조용히 무계측이 된다.
3. **`group_created` 이벤트는 일부러 없다.** `POST /user`가 트랜잭션 안에서 그룹을
   무조건 하나 만들어서(`user.service.ts:48`) `sign_up` 수 = 신규 그룹 수다.

`useSearchParams`를 쓰지 않은 것도 의도적이다 — 쓰면 Suspense 경계가 강제되고
정적 라우트 12개가 동적으로 바뀐다. UTM은 gtag가 `document.location`에서 읽는다.
```

"미해결 이슈"에 추가:

```markdown
- **개인정보처리방침 페이지가 없다** — GA4가 쿠키/식별자를 심으므로 국내
  개인정보보호법상 고지 대상이다. 방침·약관 페이지가 아예 없는 상태로 계측을
  시작했다(인지된 선택). `/privacy` 추가 필요.
- **프론트엔드에 테스트 러너가 없다** — 계측 회귀를 자동으로 잡을 수 없고,
  `pnpm lint`도 동작하지 않는다(`eslint.config.mjs` flat config만 있고 Next 14.1의
  `next lint`는 `.eslintrc*`를 찾아 설정 마법사가 뜬다).
- **이메일 인증 단계 이탈이 계측되지 않는다** — SES 복구 직후라 인증 요청→인증
  완료→가입 완료 깔때기의 이탈 지점이 궁금해질 수 있다. 이번 범위에서 제외했다.
```

- [ ] **Step 6: `docs/featurelist.md`의 GA 항목을 완료 처리한다**

`- [ ] GA 적용` → `- [x] GA 적용`

- [ ] **Step 7: `handoff.md`의 남은 TODO 목록에서 GA를 제거한다**

`handoff.md`의 "남은 TODO" 섹션에서 `- [ ] GA 적용` 줄을 삭제한다.

- [ ] **Step 8: 문서 갱신을 커밋한다**

```bash
cd /Users/onady/project/dngg
git add handoff.md docs/featurelist.md
git commit -m "docs: GA4 계측 도입 완료 처리 및 인수인계 문서 갱신"
```

- [ ] **Step 9: (사람 확인 후) 배포한다**

Step 2의 repo variable 등록이 끝났는지 다시 확인한다. 안 됐으면 여기서 멈춘다.

```bash
cd /Users/onady/project/dngg && git log --oneline -6 && git push origin main
```

`frontend/**`와 `.github/workflows/deploy.yml`이 바뀌었으므로 frontend 잡과 deploy 잡이 돈다. Actions 탭에서 **frontend 잡이 success인지** 확인한다 — 실패하면 구버전 프론트가 그대로 남고 계측은 안 켜진다.

- [ ] **Step 10: 운영 스모크**

`https://dngg.one` 접속 후:

1. 개발자도구 Network에 `googletagmanager.com/gtag/js?id=G-...` 요청이 **200**으로 뜬다. 안 뜨면 repo variable이 빌드에 안 들어간 것이다.
2. GA4 콘솔 → 보고서 → **실시간**에서 사용자 1명과 `page_view` 확인.
3. 선수 상세에서 공유 버튼을 한 번 눌러 실시간에 `share_click` 확인.

- [ ] **Step 11: (사람, 배포 후) 맞춤 측정기준을 등록한다**

GA4 콘솔 → 관리 → 맞춤 정의 → 맞춤 측정기준 만들기. 범위는 **이벤트**:

| 측정기준 이름 | 이벤트 매개변수 |
|---|---|
| player_id | `player_id` |
| method | `method` |
| page_path | `page_path` |

등록하지 않으면 데이터는 쌓이지만 보고서에서 이 값들로 나눠 볼 수 없다. 등록 시점 **이후** 데이터부터 적용된다.

---

## 실패 시 롤백

계측이 운영을 깨뜨릴 경로는 사실상 없다(`track()`은 throw하지 않고, 스크립트 로드 실패는 무해하다). 그래도 되돌려야 하면 두 가지 방법이 있다:

1. **빠른 차단** — GitHub repo Variables에서 `NEXT_PUBLIC_GA_ID`를 빈 값으로 바꾸고 프론트를 재빌드(workflow_dispatch). 계측만 꺼지고 코드는 남는다.
2. **완전 롤백** — 문제 커밋을 revert해 새로 배포한다. 서버 `.env`의 `FRONTEND_VERSION`을 직전 `sha-`로 되돌리는 방법도 있지만, 다음 프론트 배포가 핀을 덮어쓰므로 지속적 롤백에는 쓰지 않는다.
