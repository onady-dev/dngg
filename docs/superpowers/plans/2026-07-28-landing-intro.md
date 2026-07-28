# 소개(랜딩) 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그아웃 방문자가 `dngg.one`에 들어왔을 때 "그룹을 선택해주세요" 대신 제품 소개와 가입 CTA를 보게 한다.

**Architecture:** `page.tsx`의 기존 `if (!selectedGroup)` 블록 안에서만 갈라진다 — 계정이 없고 그룹도 안 고른 방문자에게만 `LandingHero`를 렌더하고, 나머지 세 상태는 지금 동작 그대로다. 랜딩은 데이터를 가져오지 않는 정적 텍스트·이미지 컴포넌트다.

**Tech Stack:** Next.js 14.1 App Router, TypeScript, styled-components, zustand

**설계 문서:** `docs/superpowers/specs/2026-07-28-landing-intro-design.md`

## Global Constraints

- **테스트 러너가 없다.** `frontend/package.json` scripts는 `dev`/`build`/`start`/`lint`뿐이다. 설계에서 러너를 들이지 않기로 확정했다. 검증 게이트는 `npx next build`와 수동 브라우저 스모크다.
- **`pnpm lint`를 쓰지 말 것.** 이 저장소에는 `eslint.config.mjs`(flat config)만 있고 Next 14.1의 `next lint`는 `.eslintrc*`를 찾는다. 실행하면 대화형 설정 마법사가 떠서 자동 실행이 멈춘다. 타입 검증은 `npx tsc --noEmit`.
- **`next/image`를 쓰지 말 것.** 이 프로젝트는 `next/image`를 한 번도 쓴 적이 없고 `sharp`가 의존성에도 `node_modules`에도 없다. Next 14는 `next start`의 이미지 최적화에 `sharp`를 요구한다.
- **`frontend/src/app/layout.tsx`를 건드리지 말 것.** `feature/ga-analytics` 브랜치가 이 파일을 수정한 채 대기 중이다. 여기서 손대면 충돌한다.
- **`main`에 푸시하면 즉시 운영 배포된다.** Task 3의 사람 확인 전까지 푸시하지 않는다.
- **커밋 메시지 설명은 한글**, conventional 타입 접두어(`feat:`/`fix:`/`docs:`)는 영문.
- 경로 별칭은 `@/*` → `./src/*` (`tsconfig.json`).
- CSS 변수는 `frontend/src/app/styles/GlobalStyles.ts`에 정의돼 있다: `--primary-color: #007AFF`, `--hover-color: #0056b3`, `--text-color: #333333`, `--header-height: 60px`.

---

## File Structure

| 파일 | 상태 | 책임 |
|---|---|---|
| `frontend/public/landing/record.png` | 신규 에셋 | 실시간 기록 스크린샷 (800×500) |
| `frontend/public/landing/rankings.png` | 신규 에셋 | 랭킹 스크린샷 (800×1213) |
| `frontend/public/landing/ability.png` | 신규 에셋 | 능력치 스크린샷 (800×616) |
| `frontend/src/app/styles/LandingStyles.ts` | 신규 | 랜딩 스타일. 프로젝트 관행대로 `styles/*.ts` 분리 |
| `frontend/src/app/components/LandingHero.tsx` | 신규 | 랜딩 본문 — 히어로·CTA·스크린샷 3단 |
| `frontend/src/app/page.tsx` | 수정 (5줄) | 비로그인 분기 + import |
| `handoff.md`, `docs/featurelist.md` | 수정 | 완료 처리 + 후속 TODO |

---

### Task 1: 랜딩 이미지 에셋 생성

**Files:**
- Create: `frontend/public/landing/record.png`
- Create: `frontend/public/landing/rankings.png`
- Create: `frontend/public/landing/ability.png`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: Task 2의 `LandingHero.tsx`가 참조하는 세 경로 — `/landing/record.png`, `/landing/rankings.png`, `/landing/ability.png`

`public/manual/screenshots/`의 **주석 없는** 실제 제품 샷을 폭 800px로 리사이즈해 복사한다. 원본은 그대로 둔다 — 메뉴얼이 계속 쓴다.

- [ ] **Step 1: 원본 3장이 있는지 확인한다**

Run:
```bash
cd /Users/onady/project/dngg/frontend/public/manual/screenshots && ls -la 07-record-loaded.png 05-rankings-loaded.png 08-player-detail.png
```
Expected: 세 파일 모두 존재. 크기는 각각 약 54KB / 103KB / 108KB. 하나라도 없으면 멈추고 보고할 것.

- [ ] **Step 2: 폭 800px로 리사이즈해 `public/landing/`에 생성한다**

`sips`는 macOS 기본 제공 도구다. **`-Z`가 아니라 `--resampleWidth`를 쓴다** — `-Z`는 긴 변을 맞추므로 세로로 긴 랭킹 스크린샷이 527px 폭으로 줄어들어 폭이 제각각이 된다.

Run:
```bash
cd /Users/onady/project/dngg/frontend/public/manual/screenshots
mkdir -p ../../landing
sips --resampleWidth 800 07-record-loaded.png  --out ../../landing/record.png
sips --resampleWidth 800 05-rankings-loaded.png --out ../../landing/rankings.png
sips --resampleWidth 800 08-player-detail.png   --out ../../landing/ability.png
```

- [ ] **Step 3: 치수와 용량을 검증한다**

Run:
```bash
cd /Users/onady/project/dngg/frontend/public/landing && sips -g pixelWidth -g pixelHeight *.png && echo "--- 합계 ---" && du -ch *.png | tail -1
```
Expected:
- `ability.png` 800×616
- `rankings.png` 800×1213
- `record.png` 800×500
- 합계 약 **244K** — 설계의 300KB 예산 이내

폭이 셋 다 800이 아니면 `-Z`를 쓴 것이다. 다시 하라.

- [ ] **Step 4: 커밋**

```bash
cd /Users/onady/project/dngg
git add frontend/public/landing
git commit -m "chore: 랜딩용 제품 스크린샷 3장 추가

public/manual/screenshots의 주석 없는 실제 화면을 폭 800px로 리사이즈했다.
원본은 메뉴얼이 계속 쓰므로 그대로 둔다. 합계 244KB."
```

---

### Task 2: `LandingHero` 컴포넌트 추가 및 `page.tsx` 분기 연결

**Files:**
- Create: `frontend/src/app/styles/LandingStyles.ts`
- Create: `frontend/src/app/components/LandingHero.tsx`
- Modify: `frontend/src/app/page.tsx`

**Interfaces:**
- Consumes: Task 1의 세 이미지 경로. 기존 `track(event: string, props?: Record<string, string | number | boolean | null | undefined>): void` (`@/lib/analytics`). 기존 `useAuthStore`의 `user` (`page.tsx:97`에서 이미 구독 중).
- Produces: `export default function LandingHero(): JSX.Element`

- [ ] **Step 1: `LandingStyles.ts`를 생성한다**

```ts
import Link from "next/link";
import styled from "styled-components";

export const Container = styled.section`
  margin: var(--header-height) auto 0;
  max-width: 48rem;
  padding: 2.5rem 1rem 3rem;
`;

export const Hero = styled.div`
  text-align: center;
  margin-bottom: 2.5rem;
`;

export const Title = styled.h1`
  font-size: 1.75rem;
  font-weight: 800;
  line-height: 1.35;
  color: var(--text-color);
  margin-bottom: 0.875rem;
  /* 한글이 단어 중간에서 끊기지 않게 한다 */
  word-break: keep-all;

  @media (min-width: 768px) {
    font-size: 2.25rem;
  }
`;

export const Subtitle = styled.p`
  font-size: 1rem;
  line-height: 1.7;
  color: #4a5568;
  margin-bottom: 1.75rem;
  word-break: keep-all;
`;

export const Cta = styled(Link)`
  display: inline-block;
  padding: 0.875rem 2rem;
  background-color: var(--primary-color);
  color: white;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 700;

  &:hover {
    background-color: var(--hover-color);
  }
`;

export const FeatureList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
`;

export const Feature = styled.figure`
  margin: 0;
`;

export const Shot = styled.img`
  display: block;
  width: 100%;
  /* 세로로 긴 랭킹 스크린샷도 같은 박스에 맞춘다 — 위쪽(순위 상단)이 남는다 */
  aspect-ratio: 8 / 5;
  object-fit: cover;
  object-position: top;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  background-color: #f7fafc;
`;

export const Caption = styled.figcaption`
  margin-top: 0.75rem;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: #4a5568;
  word-break: keep-all;
`;

export const CaptionStrong = styled.strong`
  display: block;
  color: var(--text-color);
  font-weight: 700;
  margin-bottom: 0.25rem;
`;
```

`styled(Link)`는 이 저장소에 이미 선례가 있다 (`page.tsx`의 `InProgressBanner`).

- [ ] **Step 2: `LandingHero.tsx`를 생성한다**

```tsx
"use client";

import { track } from "@/lib/analytics";
import * as S from "../styles/LandingStyles";

// 스크린샷은 public/manual/screenshots의 주석 없는 실제 화면을 폭 800px로 리사이즈해
// public/landing/에 커밋한 것이다. next/image는 쓰지 않는다 — 이 프로젝트에 sharp가
// 없어서 운영 next start의 이미지 최적화 경로가 깨진다.
const FEATURES = [
  {
    src: "/landing/record.png",
    alt: "경기 기록 화면 — 선수별 득점·리바운드·어시스트를 터치로 기록하는 모습",
    title: "실시간 터치 기록",
    body: "경기 중에 득점·리바운드·어시스트를 터치로 남깁니다.",
  },
  {
    src: "/landing/rankings.png",
    alt: "랭킹 화면 — 선수별 기록이 순위표로 정리된 모습",
    title: "자동 랭킹",
    body: "기록이 쌓이면 팀 랭킹이 저절로 정리됩니다.",
  },
  {
    src: "/landing/ability.png",
    alt: "선수 상세 화면 — 6각 능력치 레이더 차트",
    title: "6각 능력치",
    body: "선수마다 능력치 카드가 만들어지고 링크 하나로 공유됩니다.",
  },
];

export default function LandingHero() {
  return (
    <S.Container>
      <S.Hero>
        <S.Title>동호회 농구, 기억이 아니라 기록으로</S.Title>
        <S.Subtitle>
          경기 끝나고 스탯 정리하느라 남지 마세요. 터치 몇 번이면 랭킹과 6각 능력치가 자동으로
          만들어집니다.
        </S.Subtitle>
        <S.Cta href="/settings" onClick={() => track("landing_cta_click")}>
          무료로 시작하기
        </S.Cta>
      </S.Hero>

      <S.FeatureList>
        {FEATURES.map((feature, index) => (
          <S.Feature key={feature.src}>
            {/* width/height를 표시 박스(aspect-ratio 8/5)와 같게 둬서 레이아웃 시프트를 막는다.
                첫 장은 화면 안에 들어오므로 eager로 받는다. */}
            <S.Shot
              src={feature.src}
              alt={feature.alt}
              width={800}
              height={500}
              loading={index === 0 ? "eager" : "lazy"}
            />
            <S.Caption>
              <S.CaptionStrong>{feature.title}</S.CaptionStrong>
              {feature.body}
            </S.Caption>
          </S.Feature>
        ))}
      </S.FeatureList>
    </S.Container>
  );
}
```

- [ ] **Step 3: `page.tsx`에 import를 추가한다**

`frontend/src/app/page.tsx`의 `import OnboardingChecklist from "./components/OnboardingChecklist";` 바로 다음 줄에 추가:

```tsx
import LandingHero from "./components/LandingHero";
```

- [ ] **Step 4: `page.tsx`의 `if (!selectedGroup)` 블록 안에서 분기한다**

기존 블록(`page.tsx:387` 부근)의 여는 중괄호 바로 다음에 3줄을 넣는다. **기존 `NoGroupContainer` 반환문은 한 글자도 바꾸지 않는다.** 최종 형태:

```tsx
  if (!selectedGroup) {
    // 계정이 없고 그룹도 안 고른 방문자에게만 소개 화면을 보여준다.
    // 비로그인 사용자도 헤더에서 그룹을 고르면 기록을 볼 수 있으므로(/group/all이 공개 API),
    // !user를 이 블록 바깥에서 검사하면 그 경로가 막힌다.
    if (!user) {
      return <LandingHero />;
    }
    return (
      <S.NoGroupContainer>
        <S.NoGroupContent>
          <S.NoGroupTitle>그룹을 선택해주세요</S.NoGroupTitle>
          <S.NoGroupText>
            상단의 그룹 선택 메뉴에서 원하는 그룹을 선택하면 해당 그룹의 게임 기록을 볼 수 있습니다.
            경기 기록·선수 관리 등 쓰기 기능은 로그인 후 이용할 수 있습니다.
          </S.NoGroupText>
          <S.UpArrow>↑</S.UpArrow>
          <GuideButton href="/manual/index.html">📖 처음이신가요? 사용 가이드 보기</GuideButton>
        </S.NoGroupContent>
      </S.NoGroupContainer>
    );
  }
```

`user`는 `page.tsx:97`에서 이미 `const user = useAuthStore((state) => state.user);`로 구독 중이다. 새로 추가하지 않는다.

- [ ] **Step 5: 타입 체크**

Run:
```bash
cd /Users/onady/project/dngg/frontend && npx tsc --noEmit; echo "exit=$?"
```
Expected: `exit=0`, 출력 없음.

- [ ] **Step 6: 빌드하고 `/`가 정적으로 남는지 확인한다**

Run:
```bash
cd /Users/onady/project/dngg/frontend && npx next build 2>&1 | tail -22
```
Expected: 빌드 성공. 라우트 표에서 **`/`가 `○ (Static)`** 이고 크기가 약 `7.9 kB`다(기존 6.92 kB + 랜딩 약 1 kB). `/`가 `λ`로 바뀌었다면 멈추고 보고할 것.

- [ ] **Step 7: 커밋**

```bash
cd /Users/onady/project/dngg
git add frontend/src/app/styles/LandingStyles.ts frontend/src/app/components/LandingHero.tsx frontend/src/app/page.tsx
git commit -m "feat: 로그아웃 홈을 제품 소개 화면으로 교체

계정이 없고 그룹도 안 고른 방문자에게만 소개 화면을 보여준다.
비로그인 사용자가 헤더에서 그룹을 골라 기록을 둘러보는 경로는 그대로다.
CTA 클릭은 landing_cta_click으로 계측한다."
```

- [ ] **Step 8: 네 상태를 브라우저에서 확인한다**

Run:
```bash
cd /Users/onady/project/dngg/frontend && pnpm dev
```

`http://localhost:3011`에서 확인한다. 그룹 선택은 헤더 우측 드롭다운, 로그아웃은 `/settings`.

| 상태 | 만드는 법 | 기대 |
|---|---|---|
| 비로그인 + 그룹 미선택 | 로그아웃 후 그룹 드롭다운을 "그룹 선택"(빈 값)으로 | **랜딩** — 제목·부제·CTA·스크린샷 3장 |
| 비로그인 + 그룹 선택 | 위 상태에서 드롭다운으로 아무 그룹 선택 | **기존 기록 화면** ← 회귀 확인 지점 |
| 로그인 + 그룹 해제 | 로그인 후 드롭다운을 빈 값으로 | 기존 "그룹을 선택해주세요" |
| 로그인 + 그룹 선택 | 로그인 직후 기본 상태 | 기존 홈 |

추가로 확인:
- CTA를 누르면 `/settings`로 이동하고, 브라우저 콘솔에 `[track] landing_cta_click {}`이 찍힌다 (측정 ID가 없을 때의 dev 폴백)
- 개발자도구를 모바일 폭 **375px**로 두고: 가로 스크롤이 생기지 않고, CTA 버튼이 화면 안에 들어오고, 스크린샷 3장이 세로로 쌓인다
- 이미지 3장이 모두 로드된다(깨진 아이콘 없음)

문제가 있으면 고치고 Step 5~7을 다시 돌린다.

---

### Task 3: 문서 갱신 및 배포

**Files:**
- Modify: `docs/featurelist.md`
- Modify: `handoff.md`

**Interfaces:**
- Consumes: Task 1~2의 결과물
- Produces: 없음 (릴리스)

- [ ] **Step 1: `docs/featurelist.md`의 항목을 완료 처리한다**

이 파일은 완료 항목에 `[x]`가 아니라 **`[v]` + 설명**을 쓴다. `[ ] 메뉴얼 페이지를 소개 페이지로 변경` 줄을 아래로 바꾼다:

```
[v] 메뉴얼 페이지를 소개 페이지로 변경 — 로그아웃 홈을 제품 소개·가입 CTA 화면으로 교체(메뉴얼은 유지)
```

- [ ] **Step 2: `handoff.md`의 "남은 TODO"에서 해당 줄을 지운다**

`- [ ] 메뉴얼 페이지를 소개 페이지로 변경` 줄을 삭제한다.

- [ ] **Step 3: `handoff.md`에 완료 섹션을 추가한다**

"## 남은 TODO" 바로 앞에 넣는다:

```markdown
### 완료 — 소개(랜딩) 화면

로그아웃 방문자가 `/`에 오면 "그룹을 선택해주세요" 대신 제품 소개와 가입 CTA를 본다.
마케팅 Phase 0의 랜딩페이지 항목(`docs/superpowers/plans/2026-07-19-marketing-phase0.md` D절).

- 설계: `docs/superpowers/specs/2026-07-28-landing-intro-design.md`
- 계획: `docs/superpowers/plans/2026-07-28-landing-intro.md`

알아야 할 것 세 가지:

1. **분기는 `page.tsx`의 `if (!selectedGroup)` 블록 *안에서* 갈라진다.** `!user`를 바깥에서
   먼저 검사하면 안 된다 — `/group/all`이 공개 API라 비로그인 사용자도 헤더에서 그룹을 골라
   기록을 볼 수 있는데, 그 경로가 막힌다.
2. **메뉴얼(`/manual/index.html`)은 그대로 남아 있다.** 헤더 nav의 `manual` 아이콘과
   로그인 사용자의 "그룹을 선택해주세요" 화면에서 여전히 연결된다. 랜딩에는 일부러 안 넣었다
   (단일 CTA).
3. **이미지는 `next/image`를 쓰지 않는다.** 이 프로젝트에 `sharp`가 없어 운영 `next start`의
   이미지 최적화가 깨진다. `public/landing/`의 미리 리사이즈한 PNG를 평범한 `<img>`로 쓴다.
   스크린샷을 갈아끼울 때 `sips --resampleWidth 800`으로 폭을 맞출 것(`-Z`는 긴 변을 맞춰서
   세로로 긴 이미지의 폭이 어긋난다).
```

"미해결 이슈"에 추가:

```markdown
- **루트 도메인 OG 카드가 없다** — `layout.tsx`의 metadata에 `openGraph` 블록이 없어
  `dngg.one`을 카톡·밴드에 붙여넣으면 미리보기가 비어 있다. 공유 루프의 진입 링크인데
  카드가 없는 상태다. `src/app/opengraph-image.tsx`를 `player/[id]`와 같은 `next/og`
  패턴으로 추가하면 된다. (랜딩 작업에서 의도적으로 범위 밖으로 뺐다 — `layout.tsx`를
  건드리면 `feature/ga-analytics`와 충돌한다)
- **GA 설계 문서에 `landing_cta_click`이 아직 없다** — 랜딩이 이벤트를 하나 늘렸는데
  `docs/superpowers/specs/2026-07-28-ga-analytics-design.md` 4절의 이벤트 표는 3개 그대로다.
  두 브랜치가 모두 `main`에 올라간 뒤 표에 추가할 것.
- **네이버 SEO가 필요해지면** — `/`의 정적 HTML은 비어 있다(`page.tsx`의 `!mounted` 게이트).
  Googlebot은 JS를 실행하지만 네이버 크롤러는 약하다. 랜딩을 게이트 앞에서 정적으로 렌더하는
  방식으로 올릴 수 있고, 대가는 로그인 사용자가 홈 방문마다 랜딩을 한 프레임 보는 것이다.
```

- [ ] **Step 4: 문서 갱신을 커밋한다**

```bash
cd /Users/onady/project/dngg
git add handoff.md docs/featurelist.md
git commit -m "docs: 소개 화면 완료 처리 및 인수인계 문서 갱신"
```

- [ ] **Step 5: (사람 확인) 배포 순서를 정한다**

`feature/ga-analytics`가 아직 머지되지 않았을 수 있다. 두 브랜치는 파일이 겹치지 않아 순서는 자유지만, 각각 프론트 이미지를 재빌드하므로 배포가 두 번 일어난다.

배포 전에 사용자에게 확인한다:
- GA 브랜치를 먼저 머지할 것인가, 랜딩을 먼저 할 것인가, 아니면 둘 다 올린 뒤 한 번에 배포할 것인가
- 사용자가 답하기 전에는 푸시하지 않는다

- [ ] **Step 6: 머지하고 푸시한다**

```bash
cd /Users/onady/project/dngg
git checkout main
git merge --no-ff feature/landing-intro
git log --oneline -3
git push origin main
```

`frontend/**`가 바뀌었으므로 frontend 잡과 deploy 잡이 돈다. Actions 탭에서 **frontend 잡이 success인지** 확인한다.

- [ ] **Step 7: 운영 스모크**

시크릿 창으로 `https://dngg.one`에 접속해(로그인 상태가 없어야 한다) 확인한다:

1. 랜딩이 뜬다 — 제목·부제·CTA·스크린샷 3장
2. 스크린샷 3장이 모두 로드된다 (Network 탭에서 `/landing/*.png`가 200)
3. CTA를 누르면 `/settings`로 이동한다
4. 헤더 드롭다운에서 아무 그룹이나 고르면 **기존 기록 화면이 나온다** ← 회귀 확인
5. 모바일 폭에서 가로 스크롤이 없다

GA가 이미 배포돼 있다면 GA4 실시간 보고서에서 `landing_cta_click`도 확인한다. 아직이면 GA 배포 후로 미룬다.

---

## 실패 시 롤백

랜딩은 데이터를 읽지 않고 기존 화면 로직을 바꾸지 않으므로 운영을 깨뜨릴 경로가 좁다. 가장 그럴듯한 실패는 **비로그인 사용자의 그룹 둘러보기가 막히는 것**(분기를 잘못 넣은 경우)이고, 이는 Task 2 Step 8과 Task 3 Step 7의 4번에서 잡힌다.

되돌려야 하면 문제 커밋을 revert해 새로 배포한다. 서버 `.env`의 `FRONTEND_VERSION`을 직전 `sha-`로 되돌리는 방법도 있지만, 다음 프론트 배포가 핀을 덮어쓰므로 지속적 롤백에는 쓰지 않는다.
