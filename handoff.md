# 작업 인수인계 (handoff)

- 최종 갱신: 2026-08-18
- **진행 중인 브랜치 없음.** 시즌제 1단계 PR #3(2026-08-17, `35a3153`), 경기 시즌 배정 PR #4(2026-08-18, `7f881cc`) 모두 머지·운영 배포 완료.
- `origin/feature/privacy-page`와 `origin/feature/marketing-relaunch`는 **이미 main에 다 들어갔다**
  (`git rev-list --count origin/main..origin/<브랜치>` = 0). 남아 있는 건 정리 안 된 껍데기이므로
  지워도 된다. `feat/season-phase1`과 `feat/game-season-assign`도 머지 완료라 삭제 가능하다.

> ⚠️ **이 문서의 "배포된 기능" 이하 절들은 2026-08-06 기준이다.** 그 뒤 `main`에 확장 대비
> (커넥션 풀·백업·모니터링·nginx), 마케팅 재개, 주간 리포트 자동화, 루트 OG 카드, 그룹명 로그인
> 등 80여 커밋이 쌓였고 이 문서에 반영되지 않았다. 그 작업들의 실제 기록은
> `PROJECT_CONTEXT.md`, `docs/runbooks/`, `docs/superpowers/specs|plans/`에 있다.
> 아래 절들을 "현재 상태"로 신뢰하지 말고 최신 여부를 먼저 확인할 것.

## 시즌제 1단계 (2026-08-17 배포) — 먼저 읽을 것

- 설계 `docs/superpowers/specs/2026-08-14-season-design.md`
- 계획 `docs/superpowers/plans/2026-08-14-season-phase1.md`
- 18커밋, 43파일(+2365/-272). 백엔드 테스트 52스위트/363테스트 통과, 양쪽 빌드 성공.

## 경기 시즌 배정 (2026-08-18 배포)

`/games`의 완료 경기 목록에서 그룹장이 경기를 골라 시즌에 배정한다. 시즌 도입 이전에 만들어진
경기를 나중에 시즌에 넣기 위한 기능이며, 아래 "🚨" 절의 빈 랭킹 문제를 실질적으로 해소한다.

- 설계 `docs/superpowers/specs/2026-08-18-game-season-assign-design.md`
- 계획 `docs/superpowers/plans/2026-08-18-game-season-assign.md`
- PR #4, 머지 커밋 `7f881cc`. **스키마 변경 없음** — 기존 `Game.seasonId`를 나중에 채우는 경로만 열었다.

**엔드포인트**

| 엔드포인트 | 권한 | 비고 |
|---|---|---|
| `PUT /game/season` | jwt(그룹장) | `{ groupId, gameIds[], seasonId \| null }` → `{ updated }`. `seasonId: null`은 시즌 미지정으로 되돌리기 |
| `GET /game?...&from=&to=` | 공개 | 날짜 범위(양끝 포함). `page`/`limit` 없으면 페이징 없이 전부. 응답에 `seasonId` 포함 |

**고칠 때 알아야 할 것 네 가지**

1. **부분 성공을 만들지 않는다.** 경기나 시즌이 하나라도 다른 그룹 소유면 전부 거부하고 아무것도
   바꾸지 않는다(`assertIdsInGroup` 두 번). "27건 중 26건만 옮겨졌다"가 이 기능에서 제일 나쁜 상태다.
2. **날짜 범위는 조회 필터일 뿐, 이동은 화면에서 체크한 id 목록으로 한다.** 범위를 서버 이동
   기준으로 쓰면 사용자가 체크를 푼 경기까지 옮겨져 보이는 것과 동작이 어긋난다. 의도적 설계다.
3. **`GET /game`은 DTO 없이 원시 `@Query` 파라미터를 쓴다 — 자동 검증이 없다.**
   `src/common/date-range.ts`의 `assertValidDateRange`가 유일한 안전망이고, **형식뿐 아니라 실재하는
   날짜인지도 검사한다.** 정규식만 있던 최초 구현에서 `2026-02-30`이 Postgres 에러를 500으로 흘려
   내부 메시지를 노출했다. 새 날짜 파라미터를 추가하면 이 헬퍼를 반드시 태울 것.
4. **`games/page.tsx`의 선택 모드 상태는 세 경로가 같은 `resetSelectModeState()`를 공유한다** —
   취소, 배정 성공, 그룹 전환. 이게 갈라지면 실제로 겪은 버그 둘이 되살아난다: 배정 후 목록이
   날짜 범위에 갇힘, 그룹 전환 후 선택 상태가 좀비로 남아 stale id로 403. 후속으로 "취소 시
   스크롤 위치 유지"를 고칠 때 **`loadFinishedInitial` 호출을 지우지 말 것** — 지우면 전자가 재발한다.

**⚠️ 브라우저 클릭 스모크를 하지 않고 배포했다 (인지된 선택).** 선택 모드 조작, 전체 선택,
날짜 필터 UI는 사람이 눌러본 적이 없다. 배포 후 확인한 것은 API·DB 레벨과 페이지 200 응답까지다:
범위조회(2026년 27건/2025년 18건), `seasonId` 응답, 날짜 검증 5종 400·윤년 200, 실제 배정
`{"updated":3}`과 되돌리기, 거부 4종(타 그룹 경기 403 / 타 그룹 시즌 403 / 타 그룹 id 403 /
빈 배열 400), 삭제된 경기는 `{"updated":0}`으로 자연 제외.

**후속 과제**: `PUT /game/season`이 API 차원에서 FINISHED로 제한되지 않음(UI로만 제약) /
범위 조회가 fail-open(서버가 `from`/`to`를 무시하면 조용히 전체가 옴) / 선택 모드에서 진행 중
경기 카드가 여전히 클릭 가능 / 취소 시 스크롤 위치 손실.

## 🚨 시즌을 "현재 시즌"으로 지정하기 전에 반드시 읽을 것

**새로 만든 시즌을 현재 시즌으로 지정하면, 그 그룹의 랭킹·선수 페이지가 모든 방문자에게
빈 화면이 된다.** 2026-08-18에 스내치 그룹에서 실제로 발생했다.

원인은 버그가 아니라 필연이다:

- 선택기의 기본값은 **현재 시즌**이다(저장된 선택 → 현재 시즌 → 전체 순).
- 기존 경기는 전부 `seasonId=null`이고, 새 시즌에는 아직 경기가 0건이다.
- 경기는 **시즌을 현재로 지정한 뒤에 생성된 것부터** 그 시즌에 귀속된다. 소급 이관은 없다.
- 따라서 **시즌을 만든 직후에는 항상 "기본 화면이 비어 있는" 구간이 생긴다.**

설계가 "기본값 = 현재 시즌"을 정하면서 이 조합을 짚지 않았고, 스펙 리뷰와 3단계 코드
리뷰에서도 걸러지지 않았다(데이터가 있는 시즌만 상정했다).

**운영 지침 (2026-08-18 경기 시즌 배정 배포로 갱신)**: 이제 과거 경기를 시즌에 넣을 수 있으므로
순서를 이렇게 하면 빈 화면 구간이 아예 생기지 않는다:

1. 시즌을 만든다 (**현재 시즌으로 지정하지 않는다**)
2. `/games` → "시즌 배정"에서 그 시즌에 속할 과거 경기를 배정한다 (날짜 범위로 한 번에 고를 수 있다)
3. `/rankings`에서 그 시즌을 골라 숫자가 맞는지 확인한다
4. 그때 현재 시즌으로 지정한다 — 화면이 채워진 상태로 시작한다

과거 경기를 넣지 않을 거라면 **시즌 운영을 실제로 시작하는 날(= 그 시즌 첫 경기를 기록하기
직전)에 현재 시즌을 지정할 것.** 시즌이 존재해도 현재 시즌이 아니면 기본값은 '전체 기간'이라
화면이 그대로다.

**이미 지정해버렸다면** 현재 시즌을 해제하면 즉시 원복된다(시즌은 남는다).
로컬에 운영 JWT 시크릿이 없으므로 서버에서:

```bash
ssh dngg 'docker exec dngg-backend-1 node -e "
const jwt=require(\"jsonwebtoken\");
process.stdout.write(jwt.sign({userId:1,email:\"ops\",groupId:<그룹id>,role:\"user\"},
  process.env.JWT_SECRET,{expiresIn:\"5m\"}));" > /tmp/optok
T=$(cat /tmp/optok)
curl -s -X PUT http://localhost:3010/season/current -H "Authorization: Bearer $T" \
  -H "Content-Type: application/json" -d "{\"groupId\":<그룹id>,\"seasonId\":null}"
rm -f /tmp/optok'
```

단, **이미 그 시즌을 드롭다운에서 골라본 사람은 선택이 localStorage에 남아 계속 빈 화면을
본다.** 시즌 자체는 존재하므로 폴백이 걸리지 않는다 — 직접 '전체 기간'을 다시 골라야 한다.

## 스모크 확인 현황

**확인됨 (2026-08-18, 사람 + 운영 DB 대조)**
- 시즌 드롭다운 전환 — 사용자 확인
- 관리 모달의 **시즌 생성**, **현재 시즌 지정** — 운영 DB에 스내치 "2026" 시즌이
  `currentSeasonId`로 지정된 채 생성돼 있었다
- 현재 시즌 **해제** — 운영 API로 실행해 확인

**아직 아무도 안 눌러본 것**
- 시즌 **이름 변경**, 시즌 **삭제**(경기 보존 경로는 로컬에서만 검증)
- 새로고침 후 선택 유지(localStorage)
- **신규 경기의 `seasonId` 스냅샷이 운영에서 실제로 걸리는지** — 현재 시즌을 해제해둔
  상태라 다음 경기는 `null`로 들어간다. 시즌 운영을 시작할 때 첫 경기의 `seasonId`를
  DB에서 한 번 확인할 것.

**배포 후 운영 확인 결과(2026-08-17)**: `GET /season?groupId=1` 200,
`GET /log/rankings?groupId=1` 200(항목 9개, 순서 고정), 기존 라우트 6종 200,
프론트 7개 페이지 200. 자유투 포함 반영 확인 — 선수 26의 득점이 358 → **374**로 올랐다
(DB 직접 대조).

**현재 운영 상태(2026-08-18)**: 스내치 그룹에 시즌 "2026"(id=1)이 존재하지만 **현재 시즌은
해제**되어 있고 배정된 경기는 0건이다(완료 경기 45건이 전부 시즌 미지정). 다른 그룹에는 시즌이 없다.

**무엇을 만들었나**: 그룹장이 시즌을 만들고 "현재 시즌"을 지정하면 이후 생성되는 경기가 그
시즌에 귀속되고, 개인 기록·능력치·팀 기여도를 시즌별로 볼 수 있다. 시즌제 전체는 3단계로
나눴고 이건 1단계다 — 2단계(경기↔팀 연결 + 팀 순위표), 3단계(팀 능력치 레이더)는 미착수이며
방향 메모가 설계 문서 부록에 있다. **팀 기록이 2단계로 밀린 이유**: `Team`(그룹 단위 재사용
팀 구성)과 경기가 아예 연결돼 있지 않다. `Game`은 팀명을 varchar 스냅샷으로만 갖는다.

**데이터 모델 — 알아야 할 것**

- `Season`(신규), `Group.currentSeasonId`, `Game.seasonId` 세 가지가 추가됐다. **셋 다 FK 없음**
  (이 저장소 정책). 시즌을 삭제해도 경기는 보존되고 `seasonId`만 `null`로 돌아간다.
- **`Game.seasonId`는 생성 시점의 현재 시즌을 서버가 스냅샷으로 복사한다.** 요청 DTO에서
  받지 않는다 — 클라이언트가 보내면 임의 시즌에 경기를 꽂을 수 있다. 기존 경기를 덮어쓸 때는
  원래 `seasonId`를 유지한다.
- **기존 경기는 전부 `seasonId=null`이고, 이를 채우는 마이그레이션은 없다.** 데이터를 변형하는
  마이그레이션이 아예 없어서 `synchronize: true` 환경의 배포 리스크가 컬럼 추가로 한정된다.
- 시즌이 하나도 없는 그룹은 화면이 지금과 똑같다(선택기 자체가 숨겨진다). 그룹장에게만
  "시즌 만들기" 진입점이 보인다 — 없으면 시즌을 만들 방법이 없다.

**⚠️ 배포로 화면의 숫자가 이미 바뀌었다 (의도된 것)**

랭킹 집계를 클라이언트(항목 N회 + 선수 M×2회 요청)에서 서버(`GET /log/rankings` 1회)로
옮기면서 기존 동작 2건을 함께 고쳤다:

1. **삭제된 경기가 랭킹에 섞이던 것** — 기존 조회에 `game.status` 필터가 없었다. 능력치·일자별
   페이지는 이미 제외하고 있어 기준이 갈렸다. (운영 영향: 로그 15건, 0.2%)
2. **자유투 득점이 득점 합계에서 빠지던 것** — 자유투 항목을 목록에서 걸러낸 뒤 그 목록으로
   총득점까지 계산했다. (운영 영향: **득점 약 +4%**, 스내치 +177점)

2번은 사용자가 체감한다. **"득점이 왜 늘었냐"는 문의에 대비할 것.** 근거 수치는 설계 문서 9.3절.

부수 효과로 랭킹 화면의 요청이 40여 회에서 1회로 줄었다.

**후속 과제 (이 브랜치 범위 밖, 최종 리뷰가 남긴 것)**

- 시즌을 연속으로 빠르게 바꾸면 늦게 도착한 이전 요청이 최신 데이터를 덮어쓸 수 있다.
  **사용자가 오류를 인지할 수 없는 유형**이라 우선순위가 높다. 랭킹·선수 상세 양쪽에
  request-id ref 가드로 막을 수 있다. (앱 전역에 원래 있던 패턴이라 이 브랜치가 만든 건 아니다)
- 랭킹 페이지는 그룹을 바꾼 직후 이전 그룹의 시즌으로 1회 요청이 나간다(빈 상태가 번쩍인 뒤
  자기 치유). 선수 상세는 `seasonsReady` 게이트로 이미 막혀 있어 두 페이지가 비대칭이다.
- 시즌을 고르면 능력치 백분위의 모집단이 그 시즌 출전자로 좁아져 값이 크게 튀는데 안내가 없다.
  `groupSize`는 응답에 이미 있고 프론트가 렌더하지 않을 뿐이다.
- `?seasonId=`(빈 문자열)가 `/log/rankings`에서만 "시즌 0" 필터로 조용히 빠진다(빈 결과 200).
  전역 ValidationPipe의 `Number('') === 0` 때문. **현재 프론트는 '전체'일 때 파라미터를 아예
  생략하므로 실사용 경로는 안전하다.** 새 화면을 붙일 때 이 규약을 깨지 말 것.
- `/log/logitem`, `/player/total-games-played/:id`는 이제 프론트가 호출하지 않지만
  **지우지 말 것** — 캐시된 구버전 번들이 계속 호출한다.

## 남은 TODO (`docs/featurelist.md`)

- [ ] 메인 페이지가 스크롤 안되게(특히 기록화면) 그리고 기록화면 가려지는 버튼 없게
- [ ] 공유 카드에 들어가는 워딩들 개선
- [ ] 마케팅 이어서 진행
- [ ] 배포중 접속 시 nginx 에러 페이지 나오는데 서버점검중 페이지로 변경

## 미해결 이슈

- **우회 기간 가입 계정 감사** — 2026-07-20 ~ 07-27 사이에 이메일 소유 증명 없이 생성된
  계정이 있을 수 있다. 가입일 기준으로 훑어볼 필요가 있다. (`PROJECT_CONTEXT.md` 9절)
- **Dockerfile Node 버전 스큐** — 운영 컨테이너는 `node:20`, CI `setup-node`는 22다.
  (`PROJECT_CONTEXT.md` 3.3)
- **개인정보처리방침 페이지가 없다 (2026-08-15 확인: 여전히 없음)** — GA4가 쿠키/식별자를
  심으므로 국내 개인정보보호법상 고지 대상이다. 방침·약관 페이지가 아예 없는 상태로 계측을
  시작했다(인지된 선택). **설계 문서는 main에 머지됐지만 `/privacy` 라우트는 구현되지 않았다**
  (`frontend/src/app/privacy` 없음). 설계
  `docs/superpowers/specs/2026-07-28-privacy-policy-design.md`.

  **막고 있는 것은 사업자 정보 6개 값(사람)이다**: 상호, 대표자 성명, 사업자등록번호,
  사업장 주소, 개인정보 보호책임자(성명·직책·이메일), 시행일. 이 값만 받으면 바로 쓸 수
  있으므로 미해결 이슈 중 가장 먼저 닫을 것.

  설계에서 확정된 것: `/privacy` 서버+클라이언트 컴포넌트 구조, 링크는 랜딩 하단과
  `/settings` 계정 카드, 방침 12개 절 + 이 서비스 고유의 두 절(팀원 정보 / 탈퇴 후 남는 것),
  그리고 **이메일 인증 기록 7일 정리 크론**. 인증 테이블이 발송 rate limit(24시간 창)에
  쓰이므로 `createdAt` 7일 기준으로 자른다 — 24시간 내 행을 지우면 한도 제한이 무너진다.
- ~~루트 도메인 OG 카드가 없다~~ — **해결됨.** `frontend/src/app/opengraph-image.tsx`가
  추가됐고 `layout.tsx`에 `openGraph` 블록이 있다(`17f919f`, `07edf47`, `ad3364d`).
- **프론트엔드 `pnpm lint`가 동작하지 않는다** — `eslint.config.mjs` flat config만 있고
  Next 14.1의 `next lint`는 `.eslintrc*`를 찾아 설정 마법사가 뜬다. 테스트 러너도 없어
  (아래 "반복해서 걸린 것" 참고) 계측 회귀는 자동으로 잡히지 않는다.
- **이메일 인증 단계 이탈이 계측되지 않는다** — SES 복구 직후라 인증 요청→인증
  완료→가입 완료 깔때기의 이탈 지점이 궁금해질 수 있다. 이번 범위에서 제외했다.
- **네이버 SEO가 필요해지면** — `/`의 정적 HTML은 비어 있다(`page.tsx`의 `!mounted` 게이트).
  Googlebot은 JS를 실행하지만 네이버 크롤러는 약하다. 랜딩을 게이트 앞에서 정적으로 렌더하는
  방식으로 올릴 수 있고, 대가는 로그인 사용자가 홈 방문마다 랜딩을 한 프레임 보는 것이다.

## 배포된 기능 — 건드리기 전에 알아야 할 것

### 그룹 생성 시 로그 항목 시드 (2026-08-06)

**그룹이 생기는 경로가 두 개인데, 실사용 경로는 가입 하나뿐이다.**

| 경로 | 실제 호출 |
|---|---|
| `POST /user` (가입) → `UserService.createUser` | 프론트가 쓰는 유일한 경로 |
| `POST /group` → `GroupService.createGroup` | **프론트가 호출하지 않는다** |

`da9eb53`(2026-07-18)이 템플릿 로그 항목 복제를 `POST /group`에만 붙여서, 실제로는
한 번도 실행되지 않았다. 가입으로 만들어진 그룹은 로그 항목이 0개가 되고, 기록 화면은
`logItems.map()`으로 버튼을 그리므로(`record/[id]/page.tsx`) **버튼이 하나도 없는 화면**이
된다. 빈 상태 안내조차 없다. 운영에서 3개 그룹(12·13·14)이 이 상태였고, 그중 Breakers(14)는
경기를 2개 만들었지만 로그가 0건이었다. 살아있는 두 그룹은 2026-08-06에 백필했다.

지금은 `src/modules/logitem/logitem-seed.ts`의 `seedLogitemsForGroup(manager, groupId)`를
양쪽 경로가 함께 쓴다. 알아둘 것:

1. **EntityManager를 인자로 받는 평범한 함수다.** 가입은 트랜잭션 안에서 그룹을 만들므로
   같은 manager를 넘겨야 원자적이다 — "그룹은 생겼는데 항목이 없는" 상태가 다시 생기지 않는다.
2. **템플릿 그룹(0)이 비어 있으면 `DEFAULT_LOGITEMS`로 폴백한다.** 부팅 시드
   (`GroupService.onModuleInit`)는 실패해도 부팅을 막지 않는 설계라, 폴백이 없으면 시드에
   실패한 인스턴스에서 가입한 그룹이 또 조용히 빈 채로 남는다.
3. **템플릿 행의 `id`를 복사하면 안 된다** — `save`가 UPDATE로 동작해 템플릿 원본을 덮어쓴다.

**그룹 생성 경로를 새로 만들면 이 함수를 부를 것.** `POST /group`을 지우는 것도 방법이지만
아직 살려뒀다.

### 소개(랜딩) 화면 (2026-08-06 배포)

로그아웃 방문자가 `/`에 오면 "그룹을 선택해주세요" 대신 제품 소개와 가입 CTA를 본다.
마케팅 Phase 0의 랜딩페이지 항목(`docs/superpowers/plans/2026-07-19-marketing-phase0.md` D절).

- 설계 `docs/superpowers/specs/2026-07-28-landing-intro-design.md`
- 계획 `docs/superpowers/plans/2026-07-28-landing-intro.md`

알아야 할 것 네 가지:

1. **분기는 `page.tsx`의 `if (!selectedGroup)` 블록 *안에서* 갈라진다.** `!user`를 바깥에서
   먼저 검사하면 안 된다 — `/group/all`이 공개 API라 비로그인 사용자도 헤더에서 그룹을 골라
   기록을 볼 수 있는데, 그 경로가 막힌다.
2. **메뉴얼(`/manual/index.html`)은 그대로 남아 있다.** 헤더 nav의 `manual` 아이콘과
   로그인 사용자의 "그룹을 선택해주세요" 화면에서 여전히 연결된다. 랜딩에는 일부러 안 넣었다
   (단일 CTA).
3. **이미지는 `next/image`를 쓰지 않는다.** 이 프로젝트에 `sharp`가 없어 운영 `next start`의
   이미지 최적화가 깨진다. `public/landing/`의 미리 리사이즈한 PNG를 평범한 `<img>`로 쓴다.
   스크린샷을 갈아끼울 때 `sips --resampleWidth 800`으로 폭을 맞출 것(`-Z`는 긴 변을 맞춰서
   세로로 긴 이미지의 폭이 어긋난다). 그리고 `<img>`에 `width`/`height` 속성을 주면서
   CSS `aspect-ratio`로 박스를 잡을 때는 **CSS에 `height: auto`를 반드시 넣어야 한다** —
   안 넣으면 height 속성이 CSS height로 잡혀 aspect-ratio가 무시되고 `object-fit: cover`가
   가로를 잘라낸다(실제로 겪었다).
4. **랜딩 이미지는 가명화한 로컬 DB에서 새로 캡처한 것이다.** 매뉴얼 스크린샷에는 실제
   사용자 이름이 들어 있었다. 갈아끼울 때 실데이터가 찍히지 않도록 주의할 것. 세 번째
   이미지는 `/player/[id]/opengraph-image`가 만드는 실제 공유 카드다. 재캡처 절차는
   계획서 Task 1에 있다.

`landing_cta_click`은 GA가 먼저 배포된 뒤에 올라갔으므로 처음부터 수집된다.
랜딩 전환율을 묻기 전에 이 이벤트가 실제로 들어오는지부터 확인할 것.

### GA4 계측 (2026-08-06 배포)

`page_view`·`sign_up`·`share_click`·`landing_cta_click` 네 이벤트와 로그인 사용자
`user_id`를 수집한다.
마케팅 Phase 0의 계측 항목(`docs/superpowers/plans/2026-07-19-marketing-phase0.md` E절).
측정 ID `G-VVC37NHFYB` (데이터 보관 14개월).

- 설계 `docs/superpowers/specs/2026-07-28-ga-analytics-design.md`
- 계획 `docs/superpowers/plans/2026-07-28-ga-analytics.md`

**배포 후 남은 사람 작업**: `player_id`·`method`를 GA4 맞춤 측정기준으로 등록해야
리포트에서 이 파라미터로 나눠 볼 수 있다. 보관 기간과 마찬가지로 **소급 적용되지 않으니**
빨리 등록할 것 — 등록 전에 들어온 이벤트는 파라미터 값 없이 집계된다.

알아야 할 것:

1. **측정 ID는 빌드 시점에 박힌다.** GitHub repo **Variables**(Secret 아님)의
   `NEXT_PUBLIC_GA_ID` → CI build-arg → Dockerfile ARG. 값을 바꾸면 프론트
   이미지를 재빌드해야 하고, `frontend/**` 변경 없이 variable만 고치면 아무 일도
   일어나지 않는다.
2. **측정 ID가 비면 계측이 통째로 꺼진다** — 스크립트를 아예 붙이지 않는다.
   로컬 오염 방지 장치지만, 운영에서 variable이 빠지면 조용히 무계측이 된다.
3. **`group_created` 이벤트는 일부러 없다.** `POST /user`가 트랜잭션 안에서 그룹을
   무조건 하나 만들어서(`user.service.ts:48`) `sign_up` 수 = 신규 그룹 수다.
4. **`page_location`은 민감 쿼리 파라미터를 제거하고 명시적으로 보낸다.** 토스 결제
   복귀 URL의 `authKey`·`customerKey`가 자동 수집을 통해 GA4로 새 나가는 것을 막으려고
   `analytics.ts`의 `SENSITIVE_QUERY_KEYS`로 걸러낸다. 새 라우트가 쿼리스트링에 자격증명·
   식별자를 담아 리다이렉트를 받는다면 이 목록에 추가해야 한다.
   `customerKey`는 Group 행에 영속되는 계정별 식별자라 한 번 나가면 회수할 수 없다.
5. **`track()`·`setAnalyticsUser()`는 throw하지 않는다 (설계 §6 불변식).** 내부 try/catch로
   경계에서 강제한다. `Signup.tsx`의 `track("sign_up")`이 성공한 `POST /user` 뒤 try 블록
   안에 있어서, 던지면 계정은 생성됐는데 "회원가입에 실패했습니다"가 뜬다. 계측 호출을
   성공 경로 뒤에 새로 넣을 때 이 불변식에 기대도 된다.

`useSearchParams`를 쓰지 않은 것도 의도적이다 — 쓰면 Suspense 경계가 강제되고
정적 라우트(현재 10개)가 동적으로 바뀐다. UTM은 gtag가 `document.location`에서 읽는다.

### 문의·피드백 (2026-07-28 ~ 29 배포)

로그인 사용자가 `/inquiry` 폼에서 문의를 남기면 `inquiry` 테이블에 저장되고,
관리자가 `/admin`의 문의 카드에서 답변하면 SES로 작성자에게 회신 메일이 나간다.

- 설계 `docs/superpowers/specs/2026-07-28-inquiry-feedback-design.md`
- 계획 `docs/superpowers/plans/2026-07-28-inquiry-feedback.md`

**엔드포인트**

| 엔드포인트 | 권한 | 비고 |
|---|---|---|
| `POST /inquiry` | jwt | 유형(bug/feature/billing/etc) + 내용(2000자) |
| `GET /admin/inquiries` | jwt+admin | `{ rows, total, page, limit }` — 기본 20건, 최대 100건 |
| `POST /admin/inquiries/:id/answer` | jwt+admin | 답변 1회, 대화 스레드 없음 (재답변은 덮어쓰기) |

**목록 응답은 배열이 아니라 봉투다.** `?status=pending&limit=1`로 `total`만 읽으면
미답변 건수를 싸게 구할 수 있다 — 관리자 화면이 그렇게 쓴다.

**여기를 고칠 때 반드시 알아야 할 세 가지:**

1. **답변 저장과 메일 발송이 한 트랜잭션이다.** 발송 실패 시 롤백되어 `pending`으로 남는다.
   불변식: **`status === 'answered'`이면 회신 메일이 실제로 발송되었다.** 재답변(덮어쓰기 +
   재발송)이 곧 재시도 경로다. 실제 SES로 발송을 실패시켜 확인했다.
2. **`Inquiry.user`에 FK가 없고 `authorEmail` 스냅샷으로 회신한다.**
   `UserService.deleteUser`가 하드 삭제라 FK를 걸면 탈퇴가 실패한다.
   `Log.player`·`InGamePlayer.player`와 같은 관행. 탈퇴한 사용자의 문의에도 답장할 수 있다.
3. **`answer()`는 행을 `pessimistic_write`로 잠그고 `update`의 `affected`를 확인한다.**
   문의 삭제 기능을 만들면 이 두 가지가 실제로 쓰인다 — SELECT와 UPDATE 사이에 행이
   사라져도 회신 메일이 나가지 않는다. 잠금 비용은 없다(어차피 UPDATE가 커밋까지 행 잠금을 쥔다).

**`assertMailConfigured` 부팅 가드** (`mail.service.ts` → `main.ts`) — `NODE_ENV`가
`prod`/`production`인데 `MAIL_FROM`이 비어 있으면 부팅을 중단한다. 이게 없으면
`MailService.send`의 dev 폴백이 조용히 no-op 해서 위 1번 불변식이 깨진다.
**서버 `.env`에 `MAIL_FROM`이 반드시 있어야 한다** (2026-07-28 확인: 설정됨).
`backend/src/main.spec.ts`가 프로세스를 직접 띄워 이 배선이 살아있는지 검증한다.

### SES 이메일 인증 복구 (2026-07-27 배포)

`ac7bd2a`. 2026-07-20에 SES 심사 미승인으로 임시 우회했던 회원가입 이메일 인증을 원복했다.
ap-northeast-2 프로덕션 액세스 승인 후, 백엔드(`assertVerified`·`markConsumed`·DTO 필수화)와
프론트(`EmailCodeVerification` 게이트)를 한 커밋에 묶어 동시 배포했다.
상세는 `PROJECT_CONTEXT.md` 5.4.

SES 아이덴티티는 `dngg.one`, `onady.dev@gmail.com` 둘 다 `SUCCESS`.
(`hny0611@naver.com`은 `FAILED` 상태였고 2026-07-29에 삭제했다.)

## 이 코드베이스에서 반복해서 걸린 것

2026-07-29에 후속 과제 8건을 정리하며 확인한 것들. 전부 실제로 재현해 본 내용이다.

- **Nest `LoggerService`의 위치 인자에 구조화 객체를 넘기지 말 것.**
  `error(message, stack, context)` / `warn(message, context)`이다. `HttpExceptionFilter`가
  여기에 요청 메타 객체를 넘기고 있었고 그 안에 **요청 `body`(가입·로그인 평문 비밀번호)**가
  들어 있었다. 로그 포맷터(`backend/src/common/log-format.ts`)는 이제 문자열이 아닌
  stack·context 항목을 버려 구조화 객체가 로그로 새지 않게 막는다.
- **`nest-winston`은 2번째 인자를 메타 `stack`에 배열로 넘긴다**(`stack: [trace || err.stack]`).
  `trace`를 읽으면 스택이 통째로 유실되고, 인자 없이 호출하면 `[undefined]`가 온다.
- **TypeORM은 `data-source.ts`에 등록되지 않은 테이블을 무시할 뿐 지우지 않는다.**
  실패 양상은 `DROP TABLE`이 아니라 **침묵**이다 — 미등록 엔티티를 고쳐도 마이그레이션이
  아예 생성되지 않아 `synchronize: false` 전환 후 DB와 코드가 조용히 어긋난다.
  `backend/src/data-source.spec.ts`가 엔티티/마이그레이션 디렉토리와 등록 목록의
  불일치를 잡는다 — 엔티티를 추가하면 이 테스트가 알려준다.
- **프론트엔드에는 테스트 러너가 없다.** `frontend/package.json`에 test 스크립트도 의존성도
  없고, CI frontend 잡은 Docker 이미지 빌드만 한다(lint도 안 돈다). 프론트 로직 검증은
  수동이거나 Playwright를 임시로 붙여야 한다. 로직이 더 늘어나면 vitest 도입을 검토할 것.
- **`/admin`의 카드는 조회 실패와 "데이터 없음"을 구분해야 한다.** `CardFallback`
  (`frontend/src/app/admin/CardFallback.tsx`)을 쓴다. 카드를 추가할 때 이 패턴을 따를 것 —
  특히 유료화 카드는 조회 실패를 "아직 시작 전"으로 표시하면 **되돌릴 수 없는 시작 버튼이
  함께 뜬다.**
- **401에는 토스트를 띄우지 말 것.** `frontend/src/lib/axios.ts` 인터셉터가 로그아웃 +
  `/settings` 리다이렉트 + 자체 토스트를 이미 처리한다. 호출부에서 또 띄우면 중복이다.
  실패 사유 분기 예시는 `frontend/src/app/admin/inquiryError.ts`.
- **`.env` 값을 손으로 파싱하지 말 것 — `dotenv.parse()`를 쓸 것.** `backend/.env.dev`의
  `JWT_SECRET`은 뒤에 인라인 주석이 붙어 있어, `cut -d= -f2`나 `line.split('=')[1]`로 읽으면
  실제 값(20자) 대신 주석까지 붙은 41자를 얻는다. 그렇게 만든 토큰은 앱이 조용히 401로
  거절하고, 원인이 서명 불일치라는 단서가 응답에 전혀 남지 않는다. (2026-08-15에 로컬
  통합 테스트용 JWT를 만들다 겪었다.)
- **`Authorization` 헤더에 개행이 섞이면 400이 나는데 로그에 아무것도 안 남는다.**
  `LoggerMiddleware`에도 안 찍히고 응답 본문도 비어 있으며 `Connection: close`만 온다 —
  Express 라우팅 이전 HTTP 파서 단계에서 잘리기 때문이다. 셸에서 토큰을 파일로 넘길 때
  값을 만드는 쪽이 stdout에 한 줄이라도 더 쓰면(예: 일부 버전의 dotenv 안내 문구) 바로
  이 증상이 된다. "400인데 서버 로그가 조용하다" = 요청 헤더가 깨졌다고 의심할 것.
- **`pkill -f "nest start"`로는 서버가 안 죽는다.** `nest start`가 자식 node 프로세스를
  띄우기 때문에 부모만 죽고 포트는 계속 잡혀 있다. 그 상태에서 새로 띄우면 `EADDRINUSE`로
  실패하는데, 구버전 서버가 그대로 응답하므로 **새 코드를 테스트한다고 믿으면서 옛 빌드를
  찌르게 된다**(신규 라우트가 404로 나와 코드가 잘못된 줄 알았다). 포트로 죽일 것:
  `lsof -ti tcp:<포트> | xargs kill -9`.

## 배포

**`main`에 푸시하면 곧바로 운영에 배포된다.** 경로 필터로 `backend/**` → 백엔드 잡,
`frontend/**` → 프론트 잡이 돈다. 루트의 `.md`만 고치면 아무 잡도 돌지 않는다.

**프론트·백엔드가 함께 가야 하는 변경은 한 커밋에 양쪽을 담으면 된다.** 두 잡이 다 돌고
같은 sha로 핀되며, `deploy` 잡이 `needs.*.result != 'failure'` 조건이라 **한쪽이라도
빌드에 실패하면 배포 자체가 스킵**된다. `workflow_dispatch`까지 쓸 필요는 없다.
(2026-07-29에 문의 목록 API 파괴적 변경을 이 방식으로 배포해 확인함.)

**CI 헬스체크는 `/group/all`과 프론트 루트만 본다** — 배포가 success여도 신규 기능 라우트는
직접 스모크할 것. 인증이 필요한 화면은 실제로 로그인해서 봐야 한다.

**시즌제 배포(2026-08-17, PR #3 / `35a3153`)에서 확인된 것**: `backend/**`와 `frontend/**`를
모두 건드리는 브랜치는 머지 커밋 하나로 두 잡이 함께 돌고 같은 sha로 핀된다 —
**`workflow_dispatch`는 필요 없었다.** (deploy 잡이 `needs.backend.result != 'failure' &&
needs.frontend.result != 'failure'` 조건이라 한쪽이라도 빌드에 실패하면 배포 자체가 스킵된다.)
run #77의 네 잡(changes/frontend/backend/deploy) 모두 success.

**시즌제를 롤백해야 한다면 반드시 동반 롤백할 것.** 백엔드만 이전 sha로 되돌리면 새 프론트가
`/log/rankings`를 호출하는데 그 라우트가 없어 **랭킹 페이지가 404로 통째로 실패**한다.
(`/season` 404는 try/catch로 '전체' 폴백되므로 선수 상세는 살아남는다 — 즉 피해는 랭킹 한 곳에
집중되고 전면적이다.) 같은 이유로 프론트만 따로 배포하는 일도 없어야 한다.

## 다른 기기에서 세팅하기

전체 절차는 `CLAUDE.md`의 "로컬에서 전체 스택 실행"에 있다. 요약하면:

```bash
git clone <repo> && cd dngg
cd backend  && pnpm install
cd ../frontend && pnpm install
docker compose up -d db          # Postgres
cd backend  && pnpm dev          # :3010
cd frontend && pnpm dev          # :3011
```

**팀 시크릿에서 따로 받아야 하는 것** (git에 없음):

- `backend/.env.dev`
- `frontend/.env.development` (`frontend/.env.dev`를 이 이름으로 복사)
- 루트 `.env` (docker compose용 `DB_USERNAME`/`DB_PASSWORD`/`DB_DATABASE`)

pnpm 버전은 CI와 맞춰 `11.13.1`을 쓴다. pnpm 11.x는 Node 22.13+가 필요하다.

`.superpowers/sdd/`의 작업 로그는 **git에 올라가지 않는 로컬 스크래치**라 다른 기기에는 없다.
이 문서가 그 요약본이다.

## 주의사항 (반복해서 문제가 됐던 것들)

- **`docker compose down -v`를 절대 쓰지 말 것** — Postgres 볼륨이 날아간다.
- **`pg-data/`는 건드리지 말 것.**
- `synchronize: true`라 엔티티 변경이 백엔드 재시작 즉시 실제 DB에 반영된다(인덱스도 자동 생성).
- 프론트 `NEXT_PUBLIC_API_URL`은 **빌드 시점에 값이 박힌다.** 서버 `.env`만 바꿔도 효과가 없다.
- **`pnpm lint`(백엔드)는 `eslint --fix`라 저장소 전체를 포맷팅한다.** 변경 파일만 보려면
  `npx eslint <파일>`을 쓸 것. 저장소에 기존 lint 에러가 많고 CI는 lint를 돌지 않는다.
- **`next dev`가 떠 있는 동안 `pnpm build`를 돌리지 말 것** — 둘 다 `.next/`를 써서
  개발 서버가 깨진다(404/500 청크). 깨졌으면 `.next` 삭제 후 재시작.
- 백엔드 watch 인스턴스가 여러 개 뜨면 나중 것이 `EADDRINUSE`로 죽고 **옛 프로세스가 포트를
  계속 잡는다.** 설정을 바꿔 재기동했는데 반영이 안 되면 이걸 의심할 것.
- 커밋 메시지 설명은 한글, conventional 타입 접두어(`feat:`/`fix:`/`docs:`)는 영문.
