# 마케팅 재개 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 유입을 열기 전에 기록 깔때기가 실제로 뚫려 있음을 증명하고, 공유 링크가 미리보기 카드를 갖게 하고, 다음 사고를 매주 자동으로 감지·통보하는 장치를 세운다.

**Architecture:** 네 갈래다. ① 회귀 검증은 코드 변경 없이 로컬 전체 스택에서 실사용 경로를 밟아 증거를 남긴다(나머지 전부의 게이트). ② 루트 OG 카드는 `/player/[id]/opengraph-image.tsx`의 검증된 `next/og` 패턴을 그대로 복제한다. ③ GA `first_log_recorded`는 기존 `track()` 추상화에 호출 한 줄을 더한다. ④ 주간 리포트는 서버의 기존 systemd 타이머 + SNS publish 패턴(`scripts/monitor-resources.sh`)을 그대로 따른다.

**Tech Stack:** Next.js 14 App Router / `next/og` / GA4 gtag / bash + systemd timer / AWS SNS / PostgreSQL 15

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-08-10-marketing-relaunch-design.md`. 충돌 시 설계가 우선한다.
- **Task 1(회귀 검증)이 게이트다.** 실패하면 Task 2 이후를 전부 보류하고 원인 수정으로 전환한다.
- 커밋 메시지 제목·본문은 한글, 타입 접두어는 영문(`feat:`, `fix:`, `docs:`).
- **`main` 푸시 = 운영 배포.** 각 태스크는 커밋까지만 하고, 푸시는 사용자가 지시할 때만 한다.
- 운영 DB에 테스트 그룹·테스트 계정을 만들지 않는다. 검증은 로컬 스택에서 한다.
- `docker compose down -v` 금지 (Postgres 볼륨 삭제).
- GA 파라미터에 PII 금지 — 이메일·이름·그룹명을 넣지 않는다. 숫자 id만 (`frontend/src/lib/analytics.ts` 상단 주석).
- GA 이벤트·파라미터 이름은 snake_case.
- `next/og` 제약: 한글은 폰트 임베드 필수(`public/fonts/Pretendard-*.otf`를 `fs.readFile`), 자식이 둘 이상인 `div`에는 `display: "flex"` 명시.
- 서버 스크립트·systemd 유닛은 저장소에서 버전 관리하고(`scripts/`, `infra/systemd/`), 서버 설치는 `docs/runbooks/backup-restore.md:47-55`의 scp → `sudo mv` → `daemon-reload` → `enable --now` 절차를 따른다. CI는 이것들을 배포하지 않는다.
- SNS 토픽 ARN은 기존 값을 재사용한다: `arn:aws:sns:ap-northeast-2:691967102238:dngg-alerts` (환경변수 `DNGG_SNS_TOPIC`으로 덮어쓰기 가능).

---

## File Structure

| 파일 | 책임 | 태스크 |
|---|---|---|
| `docs/superpowers/specs/2026-08-10-marketing-relaunch-design.md` (수정) | 회귀 검증 결과 기록 | 1 |
| `frontend/src/app/opengraph-image.tsx` (신규) | 루트 URL의 공유 카드 이미지 생성 | 2 |
| `frontend/src/app/layout.tsx` (수정) | 루트 openGraph/twitter 메타데이터 | 2 |
| `frontend/src/app/record/[id]/page.tsx` (수정) | 경기 첫 로그 기록 시 GA 이벤트 발화 | 3 |
| `scripts/weekly-report.sh` (신규) | 주간 지표 집계 + SNS 발송 | 4 |
| `infra/systemd/dngg-weekly-report.service` (신규) | 스크립트 실행 유닛 | 4 |
| `infra/systemd/dngg-weekly-report.timer` (신규) | 월요일 오전 발화 | 4 |
| `docs/runbooks/marketing-metrics.md` (신규) | 감지 쿼리 수동 실행법 + 리포트 해석 | 4 |
| `docs/marketing/outreach-templates.md` (신규) | 총무 1:1 메시지 · 카페 게시물 · 농우회 인터뷰 질문지 | 6 |

---

### Task 1: 회귀 검증 — 유입 개시의 게이트

가입으로 만들어진 신규 그룹이 실제로 기록에 성공하는지 **실행으로** 확인한다. `user-signup.spec.ts`와 `logitem-seed.spec.ts`가 이미 목(mock) 수준에서 시드를 검증하지만, 이번 사고는 목이 통과하는 동안 운영에서 6개월간 진행됐다. 그래서 실제 DB·실제 화면으로 확인한다.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-10-marketing-relaunch-design.md` (1.2절에 검증 결과 추가)

**Interfaces:**
- Consumes: 없음
- Produces: 검증 통과 사실. Task 2 이후가 여기에 의존한다.

- [ ] **Step 1: 로컬 스택 기동**

```bash
colima start                      # 이미 떠 있으면 생략
cd /Users/onady/project/dngg
docker compose up -d db
```

- [ ] **Step 2: 백엔드·프론트 기동 (터미널 2개)**

```bash
cd backend  && pnpm dev           # :3010
cd frontend && pnpm dev           # :3011
```

- [ ] **Step 3: 신규 계정으로 가입**

브라우저에서 `http://localhost:3011/settings` → 회원가입.
`backend/.env.dev`에 `MAIL_FROM`이 없으면 인증 메일은 실발송 대신 **백엔드 콘솔에 코드가 출력된다** — 거기서 코드를 복사한다.

- [ ] **Step 4: 시드 확인 — logitem 10개**

```bash
docker compose exec db psql -U postgres -d dngg -c \
  "select g.id, g.name, count(l.id) as logitems
     from \"group\" g left join logitem l on l.\"groupId\" = g.id
    group by g.id, g.name order by g.id desc limit 3;"
```

기대: 방금 만든 그룹의 `logitems` = **10**. 0이면 **여기서 중단**하고 원인 수정으로 전환한다.

- [ ] **Step 5: 선수 추가 → 팀 구성 → 경기 생성**

`/teams`에서 선수 4명 이상 추가하고 팀 두 개 구성 → `/games`에서 새 경기 생성.

- [ ] **Step 6: 기록 화면에서 실제로 기록**

경기 진입 → **기록 항목 버튼이 화면에 그려지는지 눈으로 확인** → 선수 선택 후 득점·리바운드 등 5회 이상 기록.

- [ ] **Step 7: 로그 저장 확인**

```bash
docker compose exec db psql -U postgres -d dngg -c \
  "select \"groupId\", count(*) from log group by 1 order by 1 desc limit 3;"
```

기대: 방금 그룹의 로그 수 ≥ 5.

- [ ] **Step 8: 집계 반영 확인**

`/rankings`와 `/player/[id]`에서 방금 기록이 순위·능력치에 반영됐는지 확인한다.

- [ ] **Step 9: 검증 결과를 설계 문서에 기록**

`docs/superpowers/specs/2026-08-10-marketing-relaunch-design.md`의 1.2절 마지막 문단
("**단, 수정 이후 신규 가입으로…**" 로 시작하는 두 줄)을 아래로 교체한다. `[날짜]`·`[N]`은 실제 값으로 채운다.

```markdown
**회귀 검증 완료([날짜]).** 로컬 전체 스택에서 신규 가입 → 선수 추가 → 경기 생성 →
로그 기록 [N]건 → 랭킹·능력치 반영까지 실행으로 확인했다. 신규 그룹에 logitem 10개가
시드되고 기록 화면에 항목 버튼이 정상 렌더된다. 유입 개시 게이트를 통과했다.
```

- [ ] **Step 10: 커밋**

```bash
git add docs/superpowers/specs/2026-08-10-marketing-relaunch-design.md
git commit -m "docs: 신규 그룹 기록 경로 회귀 검증 결과 기록

로컬 전체 스택에서 가입부터 로그 기록·집계 반영까지 실행으로 확인했다.
유입 개시 게이트를 통과했다."
```

---

### Task 2: 루트 OG 카드

`https://dngg.one`을 카톡·밴드에 붙여넣을 때 미리보기 카드가 나오게 한다. 현재 루트에는 `openGraph` 메타가 전혀 없어 카드가 비어 나간다.

**Files:**
- Create: `frontend/src/app/opengraph-image.tsx`
- Modify: `frontend/src/app/layout.tsx` (`metadata` 객체)

**Interfaces:**
- Consumes: Task 1의 게이트 통과
- Produces: `https://dngg.one/opengraph-image` PNG 엔드포인트. `og:image` 메타가 자동 연결된다.

- [ ] **Step 1: OG 이미지 컴포넌트 작성**

`frontend/src/app/opengraph-image.tsx` 생성:

```tsx
import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";

// 루트 URL(dngg.one) 공유 카드. 카톡·밴드 링크 미리보기로 노출된다.
// 특정 팀에 속하지 않는 URL이므로 동적 데이터 없이 브랜드 카드로 고정한다.
export const runtime = "nodejs";
export const alt = "dn.gg — 동호회 농구 경기 기록·랭킹";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#2563eb";
const INK = "#0f172a";
const MUTED = "#64748b";

export default async function Image() {
  const fontDir = join(process.cwd(), "public", "fonts");
  const [regular, bold] = await Promise.all([
    readFile(join(fontDir, "Pretendard-Regular.otf")),
    readFile(join(fontDir, "Pretendard-Bold.otf")),
  ]);
  const fonts = [
    { name: "Pretendard", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Pretendard", data: bold, weight: 700 as const, style: "normal" as const },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#ffffff",
          fontFamily: "Pretendard",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", fontSize: 34, color: ACCENT, fontWeight: 700 }}>
              dn.gg
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                fontSize: 64,
                fontWeight: 700,
                color: INK,
                marginTop: 24,
                lineHeight: 1.25,
              }}
            >
              <div style={{ display: "flex" }}>동호회 농구,</div>
              <div style={{ display: "flex" }}>기억이 아니라 기록으로</div>
            </div>
            <div style={{ display: "flex", fontSize: 32, color: MUTED, marginTop: 28 }}>
              터치 몇 번이면 랭킹·능력치가 자동으로
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 240 }}>🏀</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 28, color: MUTED }}>
            실시간 경기 기록 · 자동 랭킹 · 6각 능력치
          </div>
          <div style={{ display: "flex", fontSize: 28, color: ACCENT, fontWeight: 700 }}>
            dngg.one
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
```

- [ ] **Step 2: layout.tsx에 openGraph 메타 추가**

`frontend/src/app/layout.tsx`의 `metadata` 객체에서 `description` 줄 **다음에** 아래를 삽입한다 (`manifest` 줄 앞).

```ts
  openGraph: {
    type: "website",
    siteName: "DN.GG",
    title: "DN.GG — 동호회 농구 경기 기록·랭킹",
    description: "터치 몇 번이면 랭킹·능력치가 자동으로. 무료 경기 기록 앱.",
    locale: "ko_KR",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
  },
```

`og:image`는 `opengraph-image.tsx`가 자동으로 붙이므로 여기에 쓰지 않는다. 절대 URL 변환은 이미 설정된 `metadataBase`가 처리한다.

- [ ] **Step 3: 프로덕션 빌드로 이미지 생성 확인**

프론트엔드에는 테스트 러너가 없다. `next dev`가 아니라 **`next start`로 확인해야 한다** — 폰트 로딩이 dev에서만 통하고 프로덕션에서 깨지는 것이 이 패턴의 알려진 함정이다.

```bash
cd frontend
pnpm build && pnpm start &
sleep 5
curl -s -o /tmp/og.png -w "%{http_code} %{content_type} %{size_download}\n" \
  http://localhost:3000/opengraph-image
```

기대: `200 image/png` + 크기 10000바이트 이상. 그 뒤 `open /tmp/og.png`로 **한글이 깨지지 않고 렌더됐는지 눈으로 확인**한다(폰트 임베드 실패 시 네모로 나온다).

- [ ] **Step 4: 메타 태그 확인**

```bash
curl -s http://localhost:3000 | grep -o 'property="og:[^"]*" content="[^"]*"'
```

기대: `og:title`, `og:description`, `og:image`, `og:type`, `og:site_name`이 모두 나온다. 확인 후 `pnpm start` 프로세스를 종료한다.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/app/opengraph-image.tsx frontend/src/app/layout.tsx
git commit -m "feat: 루트 URL에 공유 카드(OG 이미지)와 openGraph 메타 추가

dngg.one을 카톡·밴드에 붙여넣으면 미리보기 카드가 비어 나가던 문제.
마케팅 채널이 전부 링크 공유라 직접적인 손실이었다.
선수 능력치 카드와 같은 next/og 패턴(Pretendard fs 로드)을 따른다."
```

- [ ] **Step 6: 배포 후 실물 확인 (푸시 이후, 사용자가 수행)**

```bash
curl -s https://dngg.one | grep -o 'property="og:image" content="[^"]*"'
```

그리고 카카오톡 나에게 보내기로 `https://dngg.one`을 붙여넣어 카드가 뜨는지 확인한다. 카카오는 미리보기를 캐시하므로, 예전 빈 카드가 남아 있으면 `https://dngg.one/?v=2`처럼 쿼리를 붙여 재요청한다.

---

### Task 3: `first_log_recorded` GA 이벤트

가입이 아니라 **기록이 실제로 남은 순간**이 진짜 활성화 지표다. 이 이벤트가 있었다면 이번 사고를 하루 만에 알아챘다.

**범위 결정:** 그룹의 "최초 1회"를 정확히 알려면 로그 쓰기마다 그룹 전체를 조회해야 하는데, 이는 경기 중 가장 뜨거운 경로에 비용을 얹는다. 대신 **경기의 첫 로그**에서 발화한다 — 프론트가 이미 들고 있는 상태(`game.logs`)로 판정할 수 있어 추가 조회가 0이고, "이 팀이 기록에 성공했다"는 사실은 동일하게 포착된다. 그룹 단위의 권위 있는 판정은 Task 4의 SQL이 맡는다.

**Files:**
- Modify: `frontend/src/app/record/[id]/page.tsx` (`handleRecordLog`)

**Interfaces:**
- Consumes: `track(event: string, props?: Record<string, string|number|boolean|null|undefined>): void` — `@/lib/analytics`
- Produces: GA4 이벤트 `first_log_recorded` (파라미터 `game_id: number`)

- [ ] **Step 1: import 추가**

`frontend/src/app/record/[id]/page.tsx` 상단 import 블록에 추가:

```ts
import { track } from "@/lib/analytics";
```

- [ ] **Step 2: 발화 지점 삽입**

`handleRecordLog` 안에서, `const created = response.data;` **바로 앞**에 삽입한다:

```ts
      // 이 경기의 첫 로그 = 이 팀이 기록에 성공한 순간. 활성화 지표로 계측한다.
      // (logitem 미시드로 기록 자체가 불가능했던 2026-08 사고를 조기에 잡기 위한 장치)
      // PII 금지 규약에 따라 숫자 id만 보낸다 — 그룹명·선수명은 넣지 않는다.
      if ((game.logs ?? []).length === 0) {
        track("first_log_recorded", { game_id: game.id });
      }
```

`game`은 이 함수 초입의 `if (!selectedPlayer || !game) return;`으로 이미 좁혀져 있어 추가 널 체크가 필요 없다.

- [ ] **Step 3: 린트·빌드 통과 확인**

```bash
cd frontend && pnpm lint && pnpm build
```

> `pnpm lint`는 `next lint`이며 이 저장소 설정상 **자동 수정이 걸릴 수 있다**. 실행 후 `git diff`로 의도치 않은 파일이 바뀌지 않았는지 확인한다.

- [ ] **Step 4: 개발 콘솔에서 발화 확인**

`NEXT_PUBLIC_GA_ID`가 없는 로컬에서 `track()`은 `console.debug("[track]", ...)`로 떨어진다. Task 1의 로컬 스택에서 새 경기를 만들고 첫 기록을 눌러 브라우저 콘솔에 다음이 찍히는지 확인한다:

```
[track] first_log_recorded { game_id: <숫자> }
```

두 번째 기록에서는 **찍히지 않아야 한다**. 찍힌다면 조건 위치가 잘못된 것이다.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/app/record/\[id\]/page.tsx
git commit -m "feat: 경기 첫 기록 시 활성화 이벤트 계측

가입이 아니라 기록이 남은 순간이 진짜 활성화 지표다.
logitem 미시드로 기록이 불가능했던 사고를 조기에 감지하기 위한 장치."
```

---

### Task 4: 주간 리포트 (감지 쿼리 + systemd 타이머 + SNS)

감지 쿼리를 만들고, 매주 월요일 자동으로 메일이 오게 한다. 쿼리만 만들고 발송을 붙이지 않으면 아무도 안 돌린다 — 그래서 한 태스크다.

**Files:**
- Create: `scripts/weekly-report.sh`
- Create: `infra/systemd/dngg-weekly-report.service`
- Create: `infra/systemd/dngg-weekly-report.timer`
- Create: `docs/runbooks/marketing-metrics.md`

**Interfaces:**
- Consumes: 서버 `.env`의 `DB_USERNAME`/`DB_PASSWORD`/`DB_DATABASE`, 기존 SNS 토픽
- Produces: 매주 월요일 09:00 KST SNS 메일 1통

- [ ] **Step 1: 리포트 스크립트 작성**

`scripts/weekly-report.sh` 생성:

```bash
#!/usr/bin/env bash
# 마케팅 주간 지표를 집계해 SNS로 보낸다. systemd 타이머가 매주 월요일 실행한다.
#
# 이 리포트의 핵심은 "막힌 그룹" 항목이다 — 경기는 만들었는데 로그가 0인 그룹.
# 2026-08 사고(신규 그룹에 logitem 미시드 → 기록 자체가 불가능)가 6개월간
# 발견되지 않은 이유가 이 감지 장치의 부재였다.
set -euo pipefail

PROJECT_DIR="${DNGG_PROJECT_DIR:-/usr/local/project/dngg}"
REGION="${AWS_REGION:-ap-northeast-2}"
TOPIC="${DNGG_SNS_TOPIC:-arn:aws:sns:ap-northeast-2:691967102238:dngg-alerts}"

set -a
# shellcheck disable=SC1091
. "${PROJECT_DIR}/.env"
set +a

q() {
  docker exec -e PGPASSWORD="${DB_PASSWORD}" postgres \
    psql -U "${DB_USERNAME}" -d "${DB_DATABASE}" -At -F ' | ' -c "$1"
}

# 1) 최근 7일 신규 그룹 (group에는 생성일이 없어 소유 user.createdAt을 대리값으로 쓴다)
NEW_GROUPS="$(q "
  select g.id, g.name, u.\"createdAt\"::date
    from \"group\" g join \"user\" u on u.\"groupId\" = g.id
   where u.\"createdAt\" >= now() - interval '7 days'
   order by u.\"createdAt\";")"

# 2) 막힌 그룹 — 최근 14일 내 생성 + 경기 있음 + 로그 0
#    14일인 이유: 동호회 경기 주기가 주 1회 수준이라 7일 창은
#    "아직 안 모인 팀"과 "막힌 팀"을 구분하지 못한다.
STUCK="$(q "
  select g.id, g.name, count(distinct ga.id) as games
    from \"group\" g
    join \"user\" u on u.\"groupId\" = g.id
    join game ga on ga.\"groupId\" = g.id
   where u.\"createdAt\" >= now() - interval '14 days'
     and not exists (select 1 from log l where l.\"groupId\" = g.id)
   group by g.id, g.name;")"

# 3) 주간 기록 활동 — 지난 7일 로그를 남긴 그룹
ACTIVE="$(q "
  select g.id, g.name, count(*) as logs
    from log l join \"group\" g on g.id = l.\"groupId\"
   where l.\"createdAt\" >= now() - interval '7 days'
   group by g.id, g.name
   order by count(*) desc;")"

# 4) Breakers(그룹 14) 복구 추적 — 복구 메일 발송 후 기록 재개 여부
BREAKERS="$(q "select count(*) from log where \"groupId\" = 14;")"

MESSAGE="$(cat <<EOF
$(date '+%Y-%m-%d') 주간 마케팅 지표

■ 신규 그룹 (최근 7일)
${NEW_GROUPS:-없음}

■ ⚠️ 막힌 그룹 — 경기는 있는데 로그 0 (최근 14일 생성)
${STUCK:-없음}
  → 있으면 즉시 해당 총무에게 연락. 기록이 아예 불가능한 상태일 수 있다.

■ 기록 활동 (최근 7일)
${ACTIVE:-없음}

■ Breakers(14) 누적 로그: ${BREAKERS}
  → 0에서 움직이면 복구 성공. 2주 무반응이면 실패 처리.

판단 기준: docs/superpowers/specs/2026-08-10-marketing-relaunch-design.md 5절
해석 방법: docs/runbooks/marketing-metrics.md
EOF
)"

aws sns publish --region "${REGION}" --topic-arn "${TOPIC}" \
  --subject "[dngg] 주간 마케팅 지표" \
  --message "${MESSAGE}" >/dev/null

echo "${MESSAGE}"
```

- [ ] **Step 2: 실행 권한 부여**

```bash
chmod +x scripts/weekly-report.sh
```

- [ ] **Step 3: systemd 유닛 작성**

`infra/systemd/dngg-weekly-report.service`:

```ini
[Unit]
Description=dngg 주간 마케팅 지표 리포트 (신규 그룹·막힌 그룹·기록 활동 → SNS)
After=docker.service

[Service]
Type=oneshot
# docker exec와 서버 .env 읽기에 root 권한이 필요하다.
User=root
Group=root
ExecStart=/usr/local/project/dngg/scripts/weekly-report.sh
# 출력은 journal로 간다: journalctl -u dngg-weekly-report.service
```

`infra/systemd/dngg-weekly-report.timer`:

```ini
[Unit]
Description=dngg 주간 마케팅 지표를 매주 월요일 09:00(KST)에 발송

[Timer]
OnCalendar=Mon *-*-* 09:00:00
# 인스턴스가 꺼져 있어 놓친 실행은 다음 부팅 직후 따라잡는다.
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
```

- [ ] **Step 4: 런북 작성**

`docs/runbooks/marketing-metrics.md` 생성:

````markdown
# 마케팅 주간 지표 — 확인과 해석

매주 월요일 09:00(KST) `dngg-weekly-report.timer`가 SNS 메일을 보낸다.
설계·판단 기준: `docs/superpowers/specs/2026-08-10-marketing-relaunch-design.md`

## 항목별 해석

| 항목 | 의미 | 걸렸을 때 할 일 |
|---|---|---|
| 신규 그룹 | 최근 7일 가입 | 5절 판단 기준의 유입 카운트 |
| **막힌 그룹** | 경기는 있는데 로그 0 | **즉시 총무에게 연락.** 기록이 불가능한 상태일 수 있다 |
| 기록 활동 | 최근 7일 로그를 남긴 그룹 | 로그 100개+ = 경기 한 판을 끝까지 기록 (활성 기준) |
| Breakers(14) | 복구 메일 결과 추적 | 0에서 움직이면 성공. 2주 무반응이면 실패 처리 |

## 수동 실행

```bash
ssh dngg 'sudo /usr/local/project/dngg/scripts/weekly-report.sh'
```

## 서버 설치·갱신

스크립트나 유닛을 고친 뒤에는 서버에 직접 반영해야 한다 — **CI는 이 파일들을 배포하지 않는다.**

```bash
scp scripts/weekly-report.sh dngg:/tmp/
scp infra/systemd/dngg-weekly-report.* dngg:/tmp/
ssh dngg 'sudo mv /tmp/weekly-report.sh /usr/local/project/dngg/scripts/ && \
  sudo chmod +x /usr/local/project/dngg/scripts/weekly-report.sh && \
  sudo mv /tmp/dngg-weekly-report.* /etc/systemd/system/ && \
  sudo systemctl daemon-reload && \
  sudo systemctl enable --now dngg-weekly-report.timer'
```

> `scp`로 `/etc`·`/usr/local`에 직접 쓰면 Permission denied가 난다. `/tmp`를 거쳐 `sudo mv`한다.

## 상태 확인

```bash
ssh dngg 'systemctl list-timers dngg-weekly-report.timer --no-pager'
ssh dngg 'journalctl -u dngg-weekly-report.service -n 50 --no-pager'
```
````

- [ ] **Step 5: 서버에 설치하고 실제로 실행**

위 런북의 설치 절차를 그대로 수행한 뒤 즉시 1회 실행해 **메일이 실제로 도착하는지** 확인한다.

```bash
ssh dngg 'sudo /usr/local/project/dngg/scripts/weekly-report.sh'
```

기대: 표준출력에 리포트 본문이 찍히고, 수 분 내 SNS 구독 메일이 도착한다.

**"막힌 그룹"에 그룹 14(Breakers)와 15(HP)가 잡혀야 정상이다.** 둘 다 14일 안에 가입했고 경기는 있는데 로그가 0이다 — 감지 쿼리가 실제로 동작한다는 증거이므로, 비어 있으면 쿼리가 잘못된 것이다. 해롱해롱팀(7/1)·Tachy(1/28)는 14일 창 밖이라 안 잡히는 게 맞다.

(HP는 본인 계정이라 조치가 필요 없다. Breakers는 이미 복구 메일을 보낸 상태다.)

- [ ] **Step 6: 타이머 등록 확인**

```bash
ssh dngg 'systemctl list-timers dngg-weekly-report.timer --no-pager'
```

기대: `NEXT`에 다음 월요일 09:00이 잡혀 있다.

- [ ] **Step 7: 커밋**

```bash
git add scripts/weekly-report.sh infra/systemd/dngg-weekly-report.service \
        infra/systemd/dngg-weekly-report.timer docs/runbooks/marketing-metrics.md
git commit -m "feat: 주간 마케팅 지표 리포트를 systemd 타이머로 자동 발송

핵심은 막힌 그룹 감지다 — 경기는 만들었는데 로그가 0인 그룹.
이 장치가 없어서 신규 그룹이 기록조차 못 하던 사고가 6개월간 방치됐다.
기존 monitor-resources.sh의 SNS 발송 패턴을 따른다."
```

---

### Task 5: Claude 주간 스케줄 (해석 + 사람 활동 리마인더)

Task 4가 숫자를 보내는 안전망이라면, 이것은 그 숫자를 판단 기준과 대조해 "지금 뭘 해야 하는지"를 내는 해석 레이어다. 캘린더를 쓰지 않기로 했으므로 사람 활동 리마인더도 여기서 겸한다.

**Files:** 없음 (스케줄 등록만)

**Interfaces:**
- Consumes: Task 4의 리포트 항목, 설계 문서 5절 판단 기준
- Produces: 주간 클라우드 에이전트 1건

- [ ] **Step 1: `/schedule` 스킬로 주간 에이전트 등록**

`schedule` 스킬을 호출해 아래 내용으로 매주 월요일 오전(Task 4의 09:00 메일 이후) 실행되는 스케줄을 만든다. 프롬프트 본문:

```
dngg 마케팅 주간 점검이다.

1. 운영 DB에서 지표를 조회한다 (ssh dngg, docker exec postgres psql):
   - 최근 7일 신규 그룹
   - 막힌 그룹: 최근 14일 생성 + 경기 있음 + 로그 0
   - 최근 7일 그룹별 로그 수
   - 그룹 14(Breakers) 누적 로그
2. docs/superpowers/specs/2026-08-10-marketing-relaunch-design.md 5절 판단
   기준과 대조해 지금 어느 구간인지 판정한다.
3. 아래를 리마인드한다:
   - 카페·밴드·오픈채팅 상주 (주 2회, 30분씩)
   - 주말 경기 후 결과 카드 공유
   - 격주 총무 1:1 접촉 3건
4. 막힌 그룹이 있으면 최우선으로 알린다 — 기록이 불가능한 상태일 수 있으니
   해당 총무에게 즉시 연락해야 한다.

운영 DB는 읽기만 한다. 테스트 데이터를 만들지 않는다.
```

- [ ] **Step 2: 등록 확인**

스케줄 목록을 조회해 다음 실행 시각이 잡혔는지 확인한다.

---

### Task 6: 실행 자료 3종

플레이북을 실제로 돌리려면 복붙할 문구가 필요하다. 가입 문구는 `docs/marketing/community-join-templates.md`에 이미 있고, 여기서는 가입 이후에 쓰는 것들을 만든다.

**Files:**
- Create: `docs/marketing/outreach-templates.md`

**Interfaces:**
- Consumes: 설계 문서 4.1~4.3절
- Produces: 없음 (사람이 쓰는 문서)

- [ ] **Step 1: 문서 작성**

`docs/marketing/outreach-templates.md`에 아래 셋을 담는다. 각 문구는 `[대괄호]` 자리만 채우면 바로 보낼 수 있어야 한다.

1. **농우회 인터뷰 질문지** — 아래를 그대로 싣는다 (30분, 4.1절의 두 목적을 동시에)

   ```
   [도입]
   1. 처음에 dn.gg를 어떻게 알게 되셨어요?
   2. 첫 경기 기록할 때까지 막히는 데는 없으셨나요?
      ※ 6/23 가입 시점엔 신규 그룹에 기록 항목이 안 만들어지는 버그가 있었습니다.
        다른 팀들은 여기서 전부 막혀 기록을 한 건도 못 남겼는데, 농우회만
        1,338개를 기록했습니다. 이 차이가 어디서 났는지가 이 인터뷰의 핵심입니다.
        (셋업을 도와드린 적이 있는지, 항목을 직접 만드셨는지 확인)

   [계속 쓰는 이유 — 카피의 원료라 본인 표현 그대로 받아적을 것]
   3. 매주 기록하시는데, 안 하면 아쉬운 게 뭔가요?
   4. 팀원들 반응은 어때요? 누가 제일 좋아하나요?
   5. 기록한 걸 팀 단톡이나 밴드에 공유하신 적 있나요? 어떤 걸 올리셨어요?

   [불편]
   6. 쓰면서 제일 번거로운 순간은 언제인가요?
   7. 그만 쓸까 생각했던 적 있으세요? 어떤 상황이었나요?

   [소개 요청 — 막연히 묻지 말고 아래 셋을 각각 물을 것]
   8. 같은 체육관 쓰는 팀 중에 기록 정리 때문에 고생하는 팀 있을까요?
   9. 정기전 상대팀 중에는요?
   10. 리그 같은 조 팀 중에는요?
       → 이름이 나오면: "제가 직접 연락드려도 될까요, 아니면 소개해주시겠어요?"
   ```

2. **총무 1:1 메시지 템플릿** 2종
   - 레퍼럴로 소개받은 팀용 (소개자 이름을 앞세운다)
   - 오픈채팅에서 발견한 총무용 (맥락이 없으므로 더 짧고 덜 요구한다)
   - 공통: 무료 + 셋업 도움 제안 + 피드백 요청. 링크는 상대가 물으면 보낸다.

3. **카페 게시물 초안** (홍보가 아닌 콘텐츠 형식)
   - 제목·본문: "우리 팀 [월] 기록 정리" 형식
   - 능력치 카드 이미지가 본문, 도구 언급은 맨 아래 한 줄
   - 운영자 승인(가입 문구 문서의 3번 옵션)을 받은 뒤에만 올린다

- [ ] **Step 2: 커밋**

```bash
git add docs/marketing/outreach-templates.md
git commit -m "docs: 총무 1:1·카페 게시물·농우회 인터뷰 문구 추가

가입 이후 실제로 돌릴 플레이북 자료. 가입 단계 문구는
community-join-templates.md에 있다."
```

---

## 완료 기준

- [ ] Task 1 게이트 통과 — 신규 가입 그룹이 기록에 성공함을 실행으로 확인
- [ ] `https://dngg.one` 링크 미리보기 카드가 카카오톡에서 렌더됨 (배포 후)
- [ ] `first_log_recorded`가 경기 첫 기록에서만 1회 발화
- [ ] 주간 리포트 메일 1통 수신 + 타이머에 다음 월요일이 잡힘
- [ ] Claude 주간 스케줄 등록
- [ ] 실행 자료 3종 문서화

**푸시는 사용자 지시가 있을 때만 한다** — `main` 푸시는 운영 배포다. Task 2·3은 프론트엔드 변경이라 푸시 시 빌드·배포 잡이 돈다.
