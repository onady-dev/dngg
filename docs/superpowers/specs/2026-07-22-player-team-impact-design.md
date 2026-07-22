# 선수 상세 — 팀 기여도 카드 설계

- 날짜: 2026-07-22
- 대상 페이지: `/player/[id]` (선수 상세)
- 상태: 설계 확정

## 배경 / 목표

선수 상세 페이지의 "일자별 기록 나열 표"는 정보 밀도만 높고 인사이트가 약하다.
일자별 행을 제거하고, 그 대신 **기록 기반으로 계산한 "팀 기여도" 카드**를 추가한다.
카드는 이 선수가 **팀 승리에 어떻게 기여하는지**와 **득점 외 능력**을 한눈에 보여준다.

## 확정된 결정 사항

1. **표 삭제 범위**: 일자별(게임별) 행만 제거한다. `전체 기록`·`게임당 평균` 요약 두 행은 유지한다.
2. **카드 위치**: 새 "팀 기여도" 카드를 요약 표 **바로 위**(능력치 카드/공유 버튼 아래)에 배치한다.
3. **계산 대상 경기**: **완료(FINISHED) 경기만**. 진행 중(IN_PROGRESS)·삭제(DELETED) 경기는 제외한다.
4. **지표 구성**: 아래 5개 소섹션(전적 / 팀 득실 / 개인 기여 / 능력 지표 / 케미) 전부 포함.

## 데이터 모델 사실 (구현 전제)

- `Game`에는 점수 컬럼이 없다. 팀 점수는 **로그(`Logitem.value`) 합**으로 계산한다.
- 각 로그의 팀 소속은 `InGamePlayer.team`(`'home'` | `'away'`)으로 매핑한다.
- **삭제된 선수의 로그는 점수/집계에서 제외한다** (FK 제거 정책; `LogService.getDailyGames`의 데일리 점수 계산 규칙과 동일하게 맞춘다 — 사용자가 보는 경기 점수와 일치시키기 위함).
- 기본 기록 항목(그룹 생성 시 시드): `어시·리바·스틸·블록·턴오버·파울`(value 0), `3점`(3)·`2점`(2)·`자유투1점`(1)·`자유투2점`(2).
- **슛 시도/실패(미스)는 기록되지 않는다** → 야투 성공률 계산 불가. 능력 지표는 기록된 카운트/득점만으로 구성한다.
- 기록 항목명은 그룹마다 커스텀 가능 → 카테고리 감지는 `ability.util.ts`의 `.includes()` 방식(`'어시'`, `'리바'`, `'스틸'`/`'블록'`, `'3점'`/`'2점'`/`'자유투'`)을 재사용한다.

## 지표 정의

전제: N = 완료 경기 수(`finishedGames`). 모든 평균의 분모는 N이다. `hasData = N > 0`.
경기 하나에서 `내 팀 점수` = 내 팀(`home`/`away`) 소속 로그 value 합, `상대 점수` = 반대 팀 로그 value 합.
경기 결과: 내 점수 > 상대 = 승, < = 패, = = 무.

### 1) 전적
- **승률(`winRate`)** = 승 ÷ N × 100 (반올림 정수, N=0이면 null). 무는 분모에 포함한다.
- **전적(`record`)** = `{ wins, draws, losses }`.
- **최근 폼(`recentForm`)** = 최근 완료 경기 최대 10개의 `'W'|'D'|'L'` 배열. **오래된→최신 순**(왼→오, 최신이 오른쪽). 게임 정렬 기준: `game.date` ASC, 동일 날짜는 `game.id` ASC.
- **연승(`streak`)** = `{ current: number, currentType: 'W'|'D'|'L'|null, best: number }`. `best`는 역대 최다 **연승(W)** 길이. `current`는 최신 경기부터 이어지는 동일 결과 연속 길이와 그 타입.

### 2) 팀 득실
- **평균 팀 득점(`avgTeamScore`)** = Σ(내 팀 점수) ÷ N (소수 1자리).
- **평균 팀 실점(`avgOpponentScore`)** = Σ(상대 점수) ÷ N (소수 1자리).
- **평균 득실 마진(`avgMargin`)** = `avgTeamScore − avgOpponentScore` (부호 유지, 소수 1자리).
- **접전(`clutch`)** = 마진 |내 점수 − 상대 점수| ≤ **5점**인 경기의 `{ games, wins, draws, losses, winRate }`. `winRate` = 승 ÷ games × 100 (games=0이면 null).

### 3) 개인 기여 (팀 대비 비중, `contributions`)
카테고리별 `{ key, label, share, present }` 배열. `share` = (완료경기 내 본인 카테고리 합) ÷ (완료경기 내 **내 팀**의 카테고리 합) × 100.
- 득점: value 합 기준. 어시/리바/수비(스틸+블록): count 기준.
- `present=false`(그룹에 해당 항목 없음)인 카테고리는 프론트에서 렌더하지 않는다.
- 팀 합이 0이면 `share=null`("-" 표시).
- "내 팀"은 경기마다 다를 수 있다(홈/어웨이). 경기별 내 팀을 골라 그 팀의 카테고리 합만 누적한다.

### 4) 능력 지표
- **종합 기여 지수(`ability.effPerGame`)** = `(득점 + 리바 + 어시 + 스틸 + 블록 − 턴오버 − 파울)`의 게임당 평균(소수 1자리). 캡션에 "미스슛 미기록 간이 EFF" 명시.
- **AST/TO(`ability.astToRatio`)** = 어시 count ÷ 턴오버 count (소수 1자리). 턴오버=0이면 null(프론트에서 "어시 N / 턴오버 0" 표기). raw로 `astCount`, `toCount`도 반환.
- **승부 임팩트(`impact`)** = `{ avgPointsInWins, avgPointsInLosses }`. 승리한 경기들의 본인 평균 득점 vs 패배한 경기들의 본인 평균 득점(각 소수 1자리, 해당 경기 없으면 null). 무승부 경기는 이 비교에서 제외.

### 5) 케미
- **가장 잘 맞는 동료(`bestTeammates`)** = 완료 경기에서 **같은 팀**으로 함께 뛴 동료별 전적. **최소 3경기(`MIN_CHEMISTRY_GAMES=3`)** 이상만 후보. `winRate` 내림차순(동률이면 함께한 경기 수 많은 순) 상위 3명. 각 `{ playerId, name, games, wins, draws, losses, winRate }`. 삭제된 동료(이름 없음)는 제외. 후보가 없으면 빈 배열 → 프론트에서 섹션 숨김.

## 백엔드 설계

### 엔드포인트
`GET /player/:id/team-impact` — 기존 `GET /player/:id/ability` 패턴과 동일(무인증 조회, `ParseIntPipe`).
컨트롤러는 `PlayerService.getPlayerTeamImpact(id)` 위임. 선수 없으면 404.
**스키마 변경 없음 → 마이그레이션 불필요.**

### 응답 타입 (`team-impact.types.ts`)
```ts
export interface TeammateChemistry {
  playerId: number; name: string;
  games: number; wins: number; draws: number; losses: number; winRate: number;
}
export interface ContributionShare {
  key: 'scoring' | 'assist' | 'rebound' | 'defense';
  label: string; share: number | null; present: boolean;
}
export interface PlayerTeamImpact {
  playerId: number; groupId: number;
  finishedGames: number; hasData: boolean;
  record: { wins: number; draws: number; losses: number };
  winRate: number | null;
  recentForm: ('W' | 'D' | 'L')[];
  streak: { current: number; currentType: 'W' | 'D' | 'L' | null; best: number };
  avgTeamScore: number; avgOpponentScore: number; avgMargin: number;
  clutch: { games: number; wins: number; draws: number; losses: number; winRate: number | null };
  contributions: ContributionShare[];
  ability: { effPerGame: number; astToRatio: number | null; astCount: number; toCount: number };
  impact: { avgPointsInWins: number | null; avgPointsInLosses: number | null };
  bestTeammates: TeammateChemistry[];
}
```

### 리포지토리 (`team-impact.repository.ts`)
완료 경기 gameId 집합 G를 먼저 구한 뒤 나머지를 G로 조회한다. 모두 QueryBuilder + 관계 조인 사용(테이블명 하드코딩 금지).

- **A. 내 완료 경기 + 팀 + 날짜**
  `InGamePlayer igp INNER JOIN igp.game game` where `playerId=:id AND game.status='FINISHED'`
  → `[{ gameId, team, date }]`. 여기서 G와 `finishedGames` 도출, 정렬 기준(date, id) 확보.
- **B. 게임별·팀별·항목별 집계 (삭제 선수 제외)**
  `Log log INNER JOIN log.logitem li INNER JOIN log.player p INNER JOIN InGamePlayer igp2 ON igp2.gameId=log.gameId AND igp2.playerId=log.playerId`
  where `log.gameId IN (G)` group by `gameId, igp2.team, li.name`
  → `[{ gameId, team, name, count, valueSum }]`. 팀 점수·상대 점수·팀 카테고리 합 도출.
- **C. 본인 게임별·항목별 집계**
  `Log log INNER JOIN log.logitem li` where `log.playerId=:id AND log.gameId IN (G)` group by `gameId, li.name`
  → `[{ gameId, name, count, valueSum }]`. 본인 득점(경기별)·카테고리 합·EFF·AST/TO 도출.
- **D. 케미용 동료 로스터**
  `InGamePlayer igp INNER JOIN igp.player p` where `igp.gameId IN (G) AND igp.playerId != :id`
  → `[{ gameId, team, playerId, name }]`. util에서 경기별 내 팀과 매칭.

G가 비면(완료 경기 0) B/C/D 조회를 생략하고 빈 결과로 `hasData=false` 반환.

### 계산 유틸 (`team-impact.util.ts`, 순수 함수 · TDD 대상)
`computeTeamImpact({ games, teamAgg, selfAgg, roster, targetPlayerId, groupId, names })` → `PlayerTeamImpact`.
`names`(그룹 로그 항목명 Set)로 `contributions`의 `present` 판정. 반올림 헬퍼는 `ability.util`의 `round1` 스타일 재사용.

### 모듈 배선
`player.module.ts`에 `TeamImpactRepository` 프로바이더 등록(기존 `AbilityRepository`와 동일 방식). `PlayerService`에 주입.

## 프론트엔드 설계

### 데이터 로딩 (`PlayerDetail.tsx`)
능력치와 동일하게 **독립 fetch**: `api.get('/player/:id/team-impact')` 성공 시 state 설정, 실패 시 `null`(카드만 숨김, 페이지 나머지 정상). `PlayerDetailClient`에 `teamImpact` prop 전달.

### 표 수정 (`PlayerDetailClient.tsx`)
- `displayRecords.map(...)`로 렌더하던 **일자별 `<tr>` 블록만 제거**. `totalStats`/`averageStats` 계산과 `전체 기록`·`게임당 평균` 행은 유지.
- 요약 표 위에 `<TeamImpactCard impact={teamImpact} />` 삽입.

### 신규 컴포넌트 (`TeamImpactCard.tsx` + 스타일)
- 5개 소섹션(전적/팀 득실/개인 기여/능력 지표/케미)을 헤딩·구분선으로 구획.
- 승률: SVG 원형 게이지. 최근폼: ●(승)/△(무)/○(패) 도트. 마진·임팩트: 부호별 색. 기여도: 채움 바.
- 색 토큰은 기존 페이지 유지: 배경 `#f8fafc`, 카드 white/라운드 1rem, 프라이머리 `#2563eb`, 음수 `#dc2626`, 중립 슬레이트.
- 반응형: 모바일 1열(타일/바 스택). `hasData=false`면 "완료된 경기가 없어 아직 집계할 수 없습니다" 빈 상태.
- `present=false` 기여도·후보 없는 케미 섹션은 렌더하지 않는다.
- 스타일은 `styles/TeamImpactStyles.ts`로 분리(파일 비대화 방지).

### 타입
`player/[id]/types.ts`에 백엔드 응답과 동일한 `PlayerTeamImpact` 및 하위 타입 추가.

## 테스트 계획

- **유닛(백엔드, TDD 우선)** `team-impact.util.spec.ts`:
  - 승/무/패 판정, 승률(무 포함 분모), 완료경기 0 → `hasData=false`.
  - 평균 득점/실점/마진, 접전(≤5) 필터·승률.
  - 기여도 share(팀 합 0 → null, present 판정), 홈/어웨이가 섞인 경기에서 내 팀만 집계.
  - EFF 공식, AST/TO(턴오버 0 → null).
  - 승부 임팩트(무 제외), 최근폼 순서·10개 제한, 연승 current/best.
  - 케미 최소 3경기 필터·정렬·삭제 동료 제외.
- **통합**: 삭제 선수 로그가 팀 점수/기여도에서 제외되는지(데일리 규칙과 일치) 확인.
- **수동 스모크**: 완료 경기 있는 선수/없는 선수/커스텀 항목 그룹에서 카드 렌더 확인.

## 범위 밖 (YAGNI)

- 야투 성공률(미스 미기록으로 불가), 홈/어웨이별 승률, 쿼터별 득점 분포 — 이번 범위 제외.
- 랭킹/데일리 등 다른 페이지 변경 없음. 엔드포인트는 신규 추가만.
