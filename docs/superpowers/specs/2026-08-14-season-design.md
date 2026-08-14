# 시즌제 도입 — 1단계 설계 (시즌 기반 + 개인 기록/능력치 시즌 필터)

작성일: 2026-08-14

## 배경

DNGG에는 시즌 개념이 없다. 모든 기록이 그룹 생성 이래 전체 누적으로만 집계된다.
그룹이 1년 이상 운영되면 신규 참가자가 상위권에 오를 수 없고, "올해 잘한 사람"을
볼 방법이 없다.

시즌제를 도입해 개인 기록·개인 능력치·팀 기록·팀 능력치를 시즌별로 볼 수 있게 한다.

## 전체 범위와 단계 분할

요청 범위 전체는 단일 spec으로 묶기에 크다. 특히 "팀 기록"은 시즌과 무관한 별개의
스키마 문제를 먼저 풀어야 한다 — 현재 `Team`(그룹 단위 재사용 팀 구성)과 경기의
팀은 **연결되어 있지 않다**. `Game`은 `homeTeamName`/`awayTeamName`을 varchar(20)
스냅샷으로만 갖고, `InGamePlayer.team`은 `'home'`/`'away'` 문자열이다.

따라서 3단계로 나눈다. **이 문서는 1단계만 다룬다.**

| 단계 | 범위 | 산출물 |
|---|---|---|
| **1단계 (이 문서)** | `Season` 엔티티 + CRUD, `Game.seasonId`, 현재 시즌 지정, 시즌 선택기 UI, 개인 기록/능력치 시즌 필터, 랭킹 서버 집계 이전 | 사용자가 체감하는 "시즌제 도입" 완료 |
| 2단계 | `Game.homeTeamId`/`awayTeamId` 추가(경기↔팀 연결), 시즌별 팀 순위표(승-무-패·득실), 경기 목록 시즌 필터 | 팀 기록 |
| 3단계 | 팀 능력치 6각 레이더 (팀 경기당 지표를 팀 모집단 안에서 백분위) | 팀 능력치 |

각 단계는 독립 배포 가능하다. 2단계가 늦어져도 1단계의 가치는 유지된다.

2단계·3단계는 각각 별도의 spec → plan → 구현 사이클을 거친다.

## 1단계 설계 결정 요약

| 항목 | 결정 |
|---|---|
| 시즌 경계 | 그룹장이 수동 생성하고 "현재 시즌"을 지정. 날짜 자동 귀속 없음 |
| 시즌 시작/종료일 | **넣지 않음** — 귀속 판정에 쓰이지 않는 날짜는 혼란만 만든다 |
| 기존 경기 | `seasonId = null`로 두고 '전체'에서만 보이게. 이관 마이그레이션 없음 |
| 기본 조회 범위 | 마지막으로 본 선택을 그룹별로 기억. 없으면 현재 시즌, 그것도 없으면 전체 |
| 랭킹 집계 위치 | 클라이언트 → **서버**로 이전 |

---

## 1. 데이터 모델

### 1.1 `Season` 엔티티 (신규, `src/entities/Season.entity.ts`)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | PK (`@PrimaryGeneratedColumn`) | |
| `groupId` | `int` | 그룹 종속 |
| `name` | `varchar(30)` | `@Unique(['groupId', 'name'])` — Team/Player와 동일 패턴 |
| `createdAt` | `timestamp`, default `CURRENT_TIMESTAMP` | 목록 정렬 기준 (최신순) |

시작/종료일 컬럼은 두지 않는다. 시즌 귀속은 "경기 생성 시점의 현재 시즌"으로만
결정되므로 날짜는 아무것도 결정하지 않는다.

### 1.2 `Group.currentSeasonId` (신규 컬럼)

`nullable int`. 현재 시즌은 그룹당 정확히 하나이므로, `Season.isCurrent` 불리언보다
여기가 단일 진실이다 — 두 행이 동시에 `isCurrent = true`가 되는 상태 자체가
불가능해진다.

### 1.3 `Game.seasonId` (신규 컬럼)

`nullable int`. 경기 생성 시점의 `Group.currentSeasonId`를 **스냅샷으로 복사**한다.
나중에 현재 시즌이 바뀌어도 과거 경기는 원래 시즌에 남는다.

기존 경기는 전부 `null`이며, 이를 채우는 마이그레이션은 하지 않는다.

### 1.4 FK 정책

`Game.seasonId`와 `Group.currentSeasonId` 모두 FK 제약을 만들지 않는다
(`createForeignKeyConstraints: false`). 이 저장소가 `Log.player`,
`InGamePlayer.player`, `TeamPlayer.player`에서 쓰는 것과 같은 패턴이며, 시즌이
삭제돼도 경기 기록이 사라지면 안 되기 때문이다.

### 1.5 인덱스

`Game`에 `@Index(['groupId', 'seasonId'])` 복합 인덱스를 선언한다. 시즌 필터 쿼리는
전부 `game`을 조인해 이 두 컬럼으로 걸린다.

### 1.6 시즌 삭제 정책

한 트랜잭션에서 순서대로 처리한다:

1. 해당 시즌의 `Game.seasonId`를 모두 `null`로 되돌린다 (경기·로그는 보존)
2. 삭제 대상이 `Group.currentSeasonId`였다면 그것도 `null`로
3. `Season` 행 삭제

UI에서는 삭제 전 "이 시즌의 경기 N건이 시즌 미지정으로 돌아갑니다" 확인을 받는다.

### 1.7 마이그레이션 부담

`app.module.ts`의 `synchronize: true`가 컬럼 3개(`Season` 테이블,
`Group.currentSeasonId`, `Game.seasonId`)를 부팅 시 자동 추가한다. **데이터를
변형하는 마이그레이션은 없다.** 운영 배포 리스크가 컬럼 추가로 한정된다.

---

## 2. 백엔드 API

### 2.1 시즌 CRUD — 신규 모듈 `src/modules/season/`

| 메서드 | 경로 | 권한 | 동작 |
|---|---|---|---|
| `GET` | `/season?groupId=` | 공개 | `{ seasons: Season[], currentSeasonId: number \| null }` |
| `POST` | `/season` | 그룹장 | `{ groupId, name }` 생성 |
| `PUT` | `/season/:id` | 그룹장 | 이름 변경 |
| `DELETE` | `/season/:id` | 그룹장 | 1.6의 삭제 정책 수행 |
| `PUT` | `/season/current` | 그룹장 | `{ groupId, seasonId: number \| null }` — `null`이면 현재 시즌 해제 |

- 쓰기는 전부 `@UseGuards(AuthGuard('jwt'))` + `assertSameGroup(req.user.groupId, dto.groupId)`
- 이름 중복은 driver error `23505` → `BadRequestException` (Team/Player와 동일 처리)
- 조회는 기존 조회 API들과 마찬가지로 공개

### 2.2 시즌 필터가 붙는 조회

**규약 (전 API 통일):**
- `seasonId` 생략 = **전체** (시즌 미지정 경기 포함)
- `seasonId=<숫자>` = 그 시즌만

'시즌 미지정 경기만 보기' 필터는 만들지 않는다.

| 엔드포인트 | 변경 |
|---|---|
| `GET /log/rankings?groupId=&seasonId=` | **신규** (3장 참고) |
| `GET /player/:id/ability?seasonId=` | `AbilityRepository` 두 쿼리에 조건 추가 |
| `GET /player/:id/team-impact?seasonId=` | `TeamImpactRepository.findFinishedGames`에 조건 추가 |

`team-impact`도 포함하는 이유: 선수 상세 페이지에 시즌 선택기가 하나 있는데 능력치
카드만 시즌을 따르고 팀 기여도 카드는 전체를 보여주면 같은 화면에서 기준이 갈린다.

### 2.3 ⚠️ `forbidNonWhitelisted` 함정

전역 `ValidationPipe`가 `whitelist` + `forbidNonWhitelisted`로 동작하므로,
`seasonId`를 받는 **모든 request DTO에 필드를 추가하지 않으면 요청이 400으로
거부된다.** 각 태스크의 완료 조건에 DTO 갱신을 명시할 것.

### 2.4 1단계에 포함하지 않는 것

- `/games` 경기 목록과 `/daily`의 시즌 필터 → 2단계에서 팀 순위표와 함께
- 공유 카드 / OG 이미지의 시즌 반영 → 현재 요청 범위 밖

---

## 3. 랭킹 서버 집계 이전

### 3.1 현재 상태 (문제)

`frontend/src/app/rankings/page.tsx`는:
1. `GET /logitem?groupId=`로 항목 목록을 받고
2. 항목마다 `GET /log/logitem?groupId=&logitemId=` (N회)
3. 등장하는 선수마다 `GET /player/:id` + `GET /player/total-games-played/:id` (M×2회)
4. 브라우저에서 전부 집계

선수 20명 그룹이면 **한 화면에 40회 이상 요청**이 나간다. 여기에 시즌 필터를
클라이언트에서 또 얹으면 페이로드는 그대로인데 로직만 복잡해진다.

### 3.2 신규 엔드포인트

`GET /log/rankings?groupId=&seasonId=` 하나가 위 전부를 대체한다.

응답은 현재 프론트가 만들어 쓰는 구조를 서버가 그대로 반환한다:

```ts
{
  rankings: [
    {
      id: number,        // logitem id, 득점 종합은 -1
      name: string,
      value: number,
      players: [
        {
          playerId: number,
          playerName: string,
          number: string | null,   // backnumber
          totalCount: number,
          avgPerGame: number,
          gamesPlayed: number,
        }
      ]
    }
  ]
}
```

- `gamesPlayed`(평균의 분모)는 **선택된 시즌 안에서의 출전 경기 수**로 계산한다.
  시즌 필터를 걸었는데 분모만 전체 경기면 평균이 전부 짓눌린다.
- 삭제된 선수는 `INNER JOIN log.player` 패턴으로 제외한다 (FK 제거 정책 대응).
- 랭킹 목록에서 이름에 '자유투'가 포함된 항목을 숨기는 기존 동작은 유지한다.
- 프론트의 `PlayerRanking` 타입에 있는 `teamId`·`position`은 응답에서 뺀다. `Player`
  엔티티에 그런 컬럼이 없어 현재도 항상 `undefined`로 채워지고 있다.

### 3.3 이전하면서 고치는 기존 동작 2건

두 건 모두 현재 랭킹 페이지의 실제 동작이며, 고치면 화면의 숫자가 바뀐다.
**둘 다 고치기로 결정했다.**

1. **삭제된 경기가 랭킹에 섞이는 문제**
   `LogRepository.findByLogItemIdAndGroupId`에 `game.status` 필터가 없어 삭제된
   경기의 기록이 랭킹에 계속 포함된다. 능력치(`AbilityRepository`)와 일자별
   페이지는 이미 `status != 'DELETED'`로 제외하고 있어 기준이 서로 달랐다.
   → 신규 집계에서 `game.status != 'DELETED'`를 적용한다. **랭킹 숫자가 줄어든다.**

2. **자유투 득점이 득점 합계에서 빠지는 문제**
   랭킹 목록에서 '자유투' 항목을 걸러낸 뒤, 그 걸러진 목록으로 득점 종합(`id: -1`)
   까지 계산해서 자유투 득점이 총득점에 안 들어간다.
   → 득점 종합은 **자유투를 포함한 전체 로그의 `logitem.value` 합**으로 계산한다.
   '자유투' 항목 자체는 랭킹 목록에서 계속 숨긴다.
   **자유투를 많이 넣는 선수의 득점이 올라간다.**

### 3.4 능력치의 시즌 필터

`AbilityRepository.aggregateGroupAbility`와 `aggregateGamesPlayed`는 이미 `game`을
조인하고 있으므로 `AND game.seasonId = :seasonId` 한 줄이면 된다.

**다만 결과의 의미가 바뀐다.** 능력치는 그룹 내 백분위(0~100)이므로 시즌을 고르면
모집단이 그 시즌 출전 선수로 좁아진다. 시즌 참가자가 2명이면 백분위는 사실상
0/100이 된다. 응답의 `groupSize`가 이미 이 정보를 노출하므로, UI에서 모집단이 작을
때 안내 문구를 띄우는 선까지만 대응한다. 모집단 ≤ 1이면 `score: null`을 반환하는
기존 동작을 그대로 탄다.

---

## 4. 프론트엔드

### 4.1 시즌 선택 상태 — `src/app/stores/seasonStore.ts` (신규, Zustand persist)

```ts
{ selectionByGroup: Record<number, number | 'all'> }
```

그룹별로 따로 기억한다. 그룹을 바꿨는데 이전 그룹의 시즌이 선택된 채로 남으면 빈
화면이 나오기 때문이다.

**선택 해석 순서** (매 진입 시):
1. 이 그룹의 저장된 선택이 있고, 그게 아직 존재하는 시즌이면 → 그것
2. 아니면 → `currentSeasonId`
3. 그것도 없으면 → `'all'`

2번 조건이 "시즌이 하나도 없는 기존 그룹은 지금과 똑같이 보인다"를 보장한다.
삭제된 시즌이 기억에 남아 있는 경우는 1번의 존재 검증에서 걸러진다.

### 4.2 `SeasonSelector` 컴포넌트

- 배치: `/rankings`, `/player/[id]`
- persist 스토어를 읽으므로 `useMounted`로 감싸 hydration mismatch를 피한다
  (이 저장소의 기존 패턴)
- 시즌이 0개인 그룹에서는 선택기를 **숨긴다**. 단 그룹장
  (`user.groupId === selectedGroup`)에게는 "시즌 만들기" 진입점을 보여준다 —
  그렇지 않으면 시즌을 만들 방법이 없다.

### 4.3 시즌 관리 UI

새 페이지를 만들지 않고, 선택기 드롭다운 하단의 "시즌 관리"에서 여는 **모달**로
처리한다. 생성 / 이름 변경 / 삭제 / 현재 시즌 지정을 한 곳에서 다룬다.
`/teams`처럼 페이지를 새로 팔 만큼 관리 대상이 많지 않다.

삭제 시 `useConfirm`으로 영향받는 경기 수를 알린다.

### 4.4 캐싱

TanStack Query 키에 `seasonId`를 포함한다 (`['rankings', groupId, seasonId]`,
`['ability', playerId, seasonId]`). 시즌을 바꾸면 캐시가 갈리므로 이미 본 시즌으로
돌아올 때 즉시 표시된다.

---

## 5. 격리 · 위조 방지

- `PUT /season/current`는 `seasonId`가 **요청자 그룹 소유인지** 검증한다. 검증하지
  않으면 다른 그룹의 시즌을 자기 현재 시즌으로 지정할 수 있다.
- 경기 생성 시 `seasonId`는 **프론트가 보내지 않고 서버가** `Group.currentSeasonId`를
  읽어 채운다. 클라이언트가 보내면 임의 시즌에 경기를 꽂을 수 있다.
- `GameService.saveGameAndLogs`가 기존 경기를 덮어쓸 때 `seasonId`는 **보존**한다
  (현재 시즌으로 갈아끼우지 않는다).

## 6. 엣지 케이스

| 상황 | 동작 |
|---|---|
| 경기가 0건인 시즌 | 랭킹·능력치 빈 상태 (`EmptyState` 컴포넌트) |
| 능력치 모집단 ≤ 1 | `score: null` (기존 동작 유지) |
| 삭제된 선수의 로그 | `INNER JOIN log.player`로 제외 (FK 제거 정책 대응) |
| 현재 시즌 해제 후 신규 경기 | `seasonId = null`로 생성, '전체'에서만 보임 |
| 기억된 시즌이 삭제됨 | 4.1의 해석 순서로 `currentSeasonId` → `'all'` 폴백 |

## 7. 테스트

기존 `*.spec.ts` 패턴을 따른다.

- `season.service.spec.ts` — 그룹 격리(타 그룹 시즌 지정 거부), 삭제 시 경기
  `seasonId` null 복원, 현재 시즌 해제
- `log.repository.rankings.spec.ts` — 시즌 필터, 삭제 경기 제외, 자유투 포함 득점
  합계 (3.3에서 고치는 두 동작을 테스트로 고정)
- `player.service.ability.spec.ts` 확장 — `seasonId` 전달 시 모집단이 좁아지는지
- `game.service` — 경기 생성 시 `currentSeasonId` 스냅샷, 덮어쓰기 시 `seasonId` 보존

## 8. 배포

### 8.1 ⚠️ 최대 리스크 — 프론트/백엔드 스큐

프론트가 `?seasonId=`를 보내는데 백엔드가 구버전이면, 전역 `forbidNonWhitelisted`가
**요청을 전부 400으로 거부**한다. 그룹명 로그인 배포 때 겪은 것과 같은 유형의
스큐다.

- **백엔드를 먼저 배포하거나 `workflow_dispatch`로 동시 배포한다.**
- CI 헬스체크는 `/group/all`과 프론트 루트만 확인하므로 이 장애를 잡지 못한다.
  배포 후 `/rankings`와 `/player/:id`를 직접 스모크할 것.

### 8.2 스키마

`synchronize: true`가 컬럼을 자동 추가한다. 백엔드 재시작 즉시 운영 DB에 반영되므로,
배포 = 스키마 변경임을 인지할 것. 되돌릴 데이터 변형은 없다.

## 9. 구현 전 확인할 것 (가정하지 말 것)

운영 DB로 직접 확인한 뒤 구현에 들어간다:

1. **`logitem.name`에 실제로 쓰이는 이름들** — 능력치 6축 매핑과 '자유투' 필터가
   전부 문자열 `includes()` 매칭에 의존한다. 실제 이름이 예상과 다르면 3.3의 자유투
   수정과 능력치 축이 엉뚱하게 동작한다.
2. **그룹당 경기·로그 규모** — 서버 집계 쿼리의 인덱스 필요성과 응답 크기 판단.

---

## 부록 — 2·3단계 방향 메모

1단계 구현 시 참고만 하고, 지금 만들지는 않는다.

- **경기↔팀 연결**: `Game`에 `homeTeamId`/`awayTeamId`(nullable, FK 없음)를 추가한다.
  경기 생성 UI(`frontend/src/app/games/page.tsx`)는 이미 `Team` 객체를 골라서
  `name`만 보내고 있으므로, `id`를 함께 보내는 것으로 프론트 변경은 최소다.
  기존 경기는 `null`이며 팀 순위표에 나타나지 않는다.
- **승패 판정**: `status = 'FINISHED'` 경기만 세고, 동점은 무승부로 별도 집계한다
  (승-무-패). 진행 중 경기는 순위표에 반영하지 않는다.
- **점수 계산**: 경기 점수는 저장된 값이 아니라 해당 팀 `InGamePlayer`의 로그
  `logitem.value` 합이다. 이는 **비득점 항목(리바운드·어시스트 등)의 `value`가 0**
  이라는 가정 위에 서 있다 — 2단계 착수 전 운영 DB에서 반드시 확인할 것.
- **팀 능력치**: 개인 `ability.util.ts`의 축 정의(`BASKETBALL_AXES`)와
  `percentileRank`를 재사용하되, 모집단을 선수가 아닌 팀으로 바꾼다.
