# Daily 페이지 개선 설계

- 날짜: 2026-07-18
- 상태: 설계 확정 (구현 전)
- 범위: `frontend/src/app/daily/page.tsx`, `backend/src/modules/log/*`, `backend/src/repository/log.repository.ts`

## 배경 및 목표

현재 daily 페이지는 날짜 드롭다운 + 선수별 기록 테이블 하나로 구성되어 있으며, 아래 문제가 있다.

1. **타 그룹 데이터 누수**: `GET /log/daily`가 groupId 필터 없이 날짜로만 조회한다 (`log.repository.ts` `findByDaily`). 같은 날짜에 다른 그룹의 로그가 섞여 내려온다.
2. **logitem 호출 오류**: 프론트가 `GET /logitem`을 groupId 없이 호출한다.
3. **날짜 목록 비효율·불일치**: 날짜 목록을 얻기 위해 그룹의 전체 게임을 fetch하고, 목록은 `game.date` 기준인데 집계는 `log.createdAt` 기준이라 어긋날 수 있다.
4. **패턴 불일치**: 프로젝트 표준(TanStack Query) 대신 raw `useState`/`useEffect` 사용.
5. **UI 빈약**: 날짜 탐색이 불편하고, 그날의 경기 결과 요약이 없다.

목표: 버그 근본 해결 + 모바일 우선 UI 재설계 + TanStack Query 전환. 새 기능(팀 랭킹, MVP, 공유 등)은 범위 밖.

**확정된 결정**: 일일 집계의 날짜 기준은 `log.createdAt`을 유지한다 (게임의 `date` 필드가 아님). 날짜 목록도 같은 기준으로 생성해 불일치를 해소한다.

## 백엔드 API 설계

`log` 모듈에 daily 관련 엔드포인트 3개를 둔다. 모두 조회용이라 기존 GET 엔드포인트들과 동일하게 AuthGuard 없이 `groupId` 쿼리 파라미터를 받는다.

### 1. `GET /log/daily?date=&groupId=` (기존 수정)

- `GetLogByDailyRequestDto`에 `groupId` 필수 필드 추가 (숫자 검증).
- `findByDaily(date, groupId)`에 `groupId` where 조건 추가 — 타 그룹 누수 수정.
- 날짜 경계를 JS `setHours` + `Between`에서 SQL `DATE(log.createdAt) = :date`로 변경한다. 아래 dates 엔드포인트와 **같은 SQL 표현식**을 사용해 날짜 경계 기준을 완전히 일치시킨다 (Node 프로세스 TZ와 DB 저장값 사이의 어긋남 제거).
- 응답 형태는 기존과 동일: `{ id, name, backnumber, totalScore, logItem: { [logitemId]: { id, name, value, count } } }[]`
- `player`가 null인 로그는 기존대로 스킵 (FK 제거 정책 준수).

### 2. `GET /log/daily/dates?groupId=` (신규)

- `SELECT DISTINCT DATE(createdAt) FROM log WHERE groupId = :groupId ORDER BY 1 DESC`
- 응답: `string[]` (ISO 날짜, 최신순).
- 로그가 실제 존재하는 날짜만 반환하므로 날짜 목록과 집계 기준이 항상 일치한다. 프론트의 전체 게임 fetch를 대체한다.

### 3. `GET /log/daily/games?date=&groupId=` (신규 — 게임 요약)

- 해당 날짜(`DATE(createdAt) = :date`)에 로그가 기록된 게임 목록과 게임별 요약을 반환.
- 응답: `{ id, homeTeamName, awayTeamName, homeScore, awayScore, status }[]`
- 스코어 계산: 그 게임의 해당 날짜 로그를 `InGamePlayer`(gameId + playerId 매칭)의 `team` 값(home/away)으로 나눠 `logitem.value`를 합산한다.
- `player`가 null이거나 `InGamePlayer` 매칭이 없는 로그는 스코어 합산에서 스킵한다.
- `IN_PROGRESS` 게임도 그날 로그가 있으면 포함한다 (프론트에서 "진행 중" 뱃지 표시).

### 라우트 순서

NestJS 라우트 매칭 특성상 `/daily/dates`, `/daily/games`를 `/game/:id`, `/player/:id`보다 먼저 선언한다 (기존 `/daily`와 동일한 위치 규칙).

## 프론트 데이터 계층

기존 `useState`/`useEffect` fetch 3벌을 TanStack Query 4개로 교체한다. 전부 `@/lib/axios`의 `api`를 사용한다 (레거시 `src/app/lib/axios.ts` 사용 금지).

| 쿼리 키 | 엔드포인트 | 용도 |
|---|---|---|
| `['daily-dates', groupId]` | `GET /log/daily/dates` | 날짜 목록 |
| `['daily-games', groupId, date]` | `GET /log/daily/games` | 게임 요약 카드 |
| `['daily-records', groupId, date]` | `GET /log/daily` | 선수 기록 테이블 |
| `['logitems', groupId]` | `GET /logitem?groupId=` | 테이블 컬럼 정의 (groupId 누락 수정) |

- `selectedDate`는 로컬 state. dates 로드 후 기본값을 최신 날짜(배열 첫 요소)로 설정.
- 정렬(기본 totalScore 내림차순, 헤더 탭 정렬 포함)은 프론트에서 `useMemo`로 처리.
- date가 없으면 games/records 쿼리는 `enabled: false`.

## UI 레이아웃 (모바일 우선)

```
┌──────────────────────────┐
│ 일일 기록                 │
│ ◀  7월 18일 (금)  ▶      │  ← sticky 날짜 내비
├──────────────────────────┤
│ ┌────────┐ ┌────────┐   │
│ │홈팀 3:2 │ │A팀 5:4 │→  │  ← 게임 요약 카드
│ │어웨이팀 │ │B팀     │   │
├──────────────────────────┤
│ #  선수   득점  골  어시…│  ← 선수 기록 테이블
│ 1  김철수  12점  3   2  │
│ 2  이영희   9점  2   1  │
└──────────────────────────┘
```

### 날짜 내비게이션

- `◀ 이전 / 현재 날짜 표시 / 다음 ▶` 버튼. 게임(로그)이 있는 날짜 사이만 이동하며, 양 끝에서는 해당 방향 버튼 비활성화.
- 가운데 날짜 표시를 탭하면 전체 날짜 select(기존 드롭다운과 동일한 native select)가 열린다.
- sticky 상단 고정 (기존 Header의 sticky 동작 유지).

### 게임 요약 카드

- 모바일: 가로 스크롤 카드 리스트. 데스크톱(≥768px): 그리드.
- 카드 내용: `홈팀명 homeScore : awayScore 어웨이팀명`. 팀명이 null이면 "홈" / "어웨이"로 폴백.
- `IN_PROGRESS` 게임은 "진행 중" 뱃지 표시.

### 선수 기록 테이블

- 순위(#) 컬럼 추가, 1~3위 행 하이라이트.
- 선수 컬럼 sticky(현행 유지), 0회는 "-" 흐리게(현행 유지).
- 헤더 탭 시 해당 컬럼 기준 정렬 토글 (내림차순 → 오름차순 → 기본).
- 모바일 패딩/폰트는 현행 축소 규칙 유지.

### 스타일

- 기존 색 체계(#3b82f6 계열)와 styled-components 패턴 유지.
- 컴포넌트가 커지면 `daily/components/`로 분리하고 스타일은 프로젝트 관례대로 같은 위치의 `styles/*.ts`로 분리한다.

## 에러 처리 및 엣지 케이스

- 쿼리별 섹션 단위 에러 표시: 요약 카드 로드 실패가 테이블 렌더를 막지 않는다. 실패 섹션에는 재시도 버튼 제공.
- 날짜 목록이 비면(그룹에 로그 없음) 빈 상태 안내 표시.
- 그룹 미선택 시 기존 `NoGroupSelected` 유지. hydration은 기존 `useMounted` 패턴 유지.

## 테스트

- 백엔드 `log.service.spec.ts` (또는 신규 스펙 파일)에 추가:
  1. `getLogByDaily`가 다른 그룹 로그를 제외하는지
  2. 날짜 경계(그날 첫/마지막 로그 포함, 전날/다음날 제외)
  3. games 요약의 홈/어웨이 스코어 계산 — null player 로그 스킵 포함
- 프론트: 테스트 러너가 없으므로 수동 스모크 (날짜 이동, 카드/테이블 렌더, 정렬, 빈 상태).
- 실행: `backend/`에서 `pnpm test`.

## 배포 주의 (⚠️ 동시 배포 필수)

`GET /log/daily`에 `groupId`가 필수가 되므로 **구버전 프론트 + 신버전 백엔드 조합은 400 에러**가 난다. 프론트·백엔드 변경을 한 커밋(또는 한 배포 단위)으로 머지하고, CI에서 두 잡이 모두 green인지 확인한다. 필요 시 workflow_dispatch로 동시 배포한다 (2026-07-18 혼합 배포 장애와 동일 유형의 리스크).

또한 CI 헬스체크는 기존 라우트만 확인하므로, 배포 후 `/log/daily/dates`, `/log/daily/games`를 직접 스모크한다.

## 범위 밖 (YAGNI)

- 캘린더 픽커 UI (native select로 충분)
- 팀별 랭킹, MVP 선정, 결과 공유 기능
- `synchronize: false` 전환 등 인프라 변경 (엔티티 변경 없음 — 스키마 영향 없음)
