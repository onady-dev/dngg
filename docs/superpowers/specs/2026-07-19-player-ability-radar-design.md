# Player 능력치 6각 레이더 그래프 — 설계

- 작성일: 2026-07-19
- 대상: `frontend/src/app/player/[id]` 페이지 개선 + `backend` player 모듈 신규 API
- 상태: 설계 승인됨 (구현 계획 대기)

## 1. 목적

선수 상세 페이지에 해당 선수의 기록을 **한눈에 읽히는 능력치 평가**로 요약하는 6각(레이더) 그래프를 추가한다. 현재 페이지는 게임별 로그 카운트 테이블만 보여주므로 "이 선수가 무엇을 잘하는가"를 직관적으로 전달하지 못한다.

핵심 요구사항(브레인스토밍 확정):

- 능력치 점수(0~100)는 **그룹 내 상대평가**로 산출한다 — "우리 그룹에서 리바운드 상위 N%" 같은 실질적 의미를 갖는다.
- 6개 축은 **농구 고정 6축**을 기본으로 하고, 농구 표준 logitem으로 매핑되지 않는 커스텀 그룹은 **사용 빈도 상위 logitem으로 동적 구성**하는 폴백을 둔다.
- 그룹 전체 집계가 필요하므로 **백엔드 신규 API**에서 계산하고, 프론트는 그리기만 한다.
- 차트는 **의존성 없는 순수 SVG 컴포넌트**로 구현한다 (현재 코드베이스에 차트 라이브러리 없음, 번들 증가 0).

## 2. 도메인 배경 (기존 코드 확인 결과)

- `Log`(playerId, gameId, logitemId, groupId, createdAt)가 득점/기록 이벤트 1건 = 1행. `Logitem`(groupId, name, value)을 참조한다. `value`는 득점 가치(3점=3, 2점=2, 자유투1점=1, 자유투2점=2, 나머지=0).
- 실제 운영 logitem 이름: `어시`, `리바`, `스틸`, `블록`, `턴오버`, `파울`, `3점`, `2점`, `자유투1점`, `자유투2점` (그룹별로 반복 정의됨, groupId 0/1 등).
- **FK 제거 정책**: `Log.player`가 `null`일 수 있다(삭제된 선수). 집계 시 null player 로그는 스킵한다. 기존 서비스(`log.service.ts`)와 동일.
- **삭제 게임 제외**: 최근 커밋(`10136e0`)이 삭제 게임 로그를 일일/선수 기록에서 제외하도록 정리함. 능력치 집계도 `game.status != 'DELETED'`를 반드시 적용한다.
- 선수 조회(`GET /player/:id`)는 인증 없이 공개다. 그룹 소속은 `player.groupId`에서 얻는다(JWT 아님).
- daily 집계 SQL은 `CAST(... AS DATE)`·표준 CAST·인용 컬럼 규칙을 따른다(과거 장애 이력). 신규 SQL도 이 규칙을 따른다.

## 3. 백엔드 설계

### 3.1 엔드포인트

```
GET /player/:id/ability
```

- 인증 불필요(선수 상세 페이지와 동일 공개 정책).
- `:id` 선수가 없으면 404.
- 그룹 범위는 `player.groupId`로 결정 — 쿼리 파라미터/JWT 신뢰하지 않음.

### 3.2 응답 스키마

```jsonc
{
  "playerId": 12,
  "groupId": 1,
  "mode": "basketball",        // "basketball" | "dynamic"
  "gamesPlayed": 8,            // 대상 선수의 (삭제 제외) 참여 게임 수
  "groupSize": 6,             // 백분위 모집단 크기(1게임 이상 참여 선수 수)
  "hasData": true,            // gamesPlayed>0 && groupSize>0
  "axes": [
    {
      "key": "scoring",
      "label": "득점력",
      "score": 82,             // 0~100 백분위 (그룹 내 상대평가). 표본 부족 시 null
      "rawPerGame": 14.5,      // 대상 선수의 게임당 원값(항상 제공)
      "groupAvgPerGame": 9.1,  // 그룹 평균(참고용)
      "higherIsBetter": true
    }
    // ... 총 6개
  ]
}
```

### 3.3 집계 로직

1. **선수 로드** → `groupId` 확보. 없으면 404.
2. **그룹 로그 집계**: 해당 groupId의 모든 로그를 `logitem`·`game` 조인, `game.status != 'DELETED'`, `player IS NOT NULL` 조건으로 `(playerId, logitemName)`별 `count`와 `SUM(value)`를 구한다. TypeORM QueryBuilder + `getRawMany()`(daily의 `findDailyDates` 패턴과 동일 스타일).
3. **게임당 참여 수(분모)**: 선수별 `gamesPlayed` = 그룹의 (삭제 제외) 게임 중 그 선수가 로그를 남긴 distinct gameId 수. (참여했으나 무기록인 게임은 능력치 rate 계산에서 제외 — 표본 왜곡 방지. 기존 `total-games-played`는 InGamePlayer 카운트라 의미가 다르므로 별도 산출.)
4. **축 매핑**(아래 3.4)으로 선수별 6축 원값(게임당 평균)을 만든다.
5. **백분위 산출**: 각 축에 대해, `gamesPlayed >= 1`인 그룹 선수들의 게임당 원값 분포에서 대상 선수의 **백분위 순위**(percentile rank)를 0~100으로 계산.
   - 공식: `score = round(100 * (강한선수수_below + 0.5 * 동점수_ties) / N)`, N=모집단 크기. (동점 절반 가산 = 표준 percentile rank, 극단값이 0/100에 몰리지 않음)
   - `안정성` 축은 **낮을수록 좋음** → 원값 부호를 뒤집어 백분위 계산(`higherIsBetter: false`, score는 여전히 "높을수록 좋음"으로 정규화).
   - `groupSize <= 1`이면 상대평가 무의미 → `score: null`(UI가 원값만 표시).
6. **대상 선수 `gamesPlayed === 0`**: `hasData: false`, 모든 `score: null`, `rawPerGame: 0`.

### 3.4 축 구성

**농구 고정 6축** (logitem 이름 부분일치로 매핑):

| key | label | 정의(게임당) | higherIsBetter |
|-----|-------|-------------|----------------|
| `scoring` | 득점력 | 득점 logitem `value` 총합 / 게임 (`3점`·`2점`·`자유투*`) | true |
| `outside` | 외곽 | `3점` 성공 횟수 / 게임 | true |
| `assist` | 어시스트 | `어시` 횟수 / 게임 | true |
| `rebound` | 리바운드 | `리바` 횟수 / 게임 | true |
| `defense` | 수비 | (`스틸` + `블록`) 횟수 / 게임 | true |
| `stability` | 안정성 | (`턴오버` + `파울`) 횟수 / 게임 (역산) | false |

매핑 규칙(이름 정규화 후 `includes`): `어시`→assist, `리바`→rebound, `스틸`|`블록`→defense, `턴오버`|`파울`→stability, `3점`→outside + scoring, `2점`|`자유투`→scoring.

**폴백 조건**: 그룹 logitem 이름 집합이 위 6축 중 **4축 미만**만 매핑되면 `mode: "dynamic"`으로 전환.

**동적 6축**: 그룹 내 사용 빈도(로그 건수) 상위 6개 logitem을 축으로 삼고, 각 축 = 그 logitem의 게임당 횟수, 전부 `higherIsBetter: true`, `label`은 logitem 이름 그대로. (6개 미만이면 있는 만큼만 — 최소 3축 이상일 때만 그래프 표시, 아니면 `hasData: false`.)

### 3.5 파일 배치

- `backend/src/modules/player/player.controller.ts` — `@Get(':id/ability')` 추가. **라우트 순서 주의**: `@Get(':id')`보다 뒤에 와도 Nest는 정적 세그먼트(`ability`)를 우선 매칭하므로 안전하나, 명확성을 위해 `:id/ability`를 `:id` 근처에 배치.
- `player.service.ts` — `getPlayerAbility(id)` 오케스트레이션.
- `backend/src/repository/log.repository.ts` — `aggregateGroupAbility(groupId)` (선수×logitem raw 집계 + 선수별 gamesPlayed). SQL은 표준 CAST·인용 컬럼 규칙 준수.
- 축 매핑·백분위 계산은 순수 함수로 분리해 단위 테스트 가능하게: `player/ability.util.ts` (매핑 테이블, 백분위 함수, 폴백 판정).
- 응답 타입: `player/types.ts`(기존)에 `PlayerAbility` 추가.

### 3.6 테스트 (jest)

- `ability.util.spec.ts`: 매핑 정확성, 백분위(동점/단독/역산 축), 폴백 판정(4축 미만), 동적축 상위 선택.
- 서비스 레벨: 404, null player 스킵, 삭제 게임 제외, gamesPlayed 0 케이스.

## 4. 프론트엔드 설계

### 4.1 데이터 페칭

`PlayerDetail.tsx`의 `Promise.all`에 `api.get('/player/${playerId}/ability')`를 추가하고, 결과를 `PlayerDetailClient`에 `ability` prop으로 전달한다. 능력치 API가 실패해도 기존 테이블은 정상 렌더되도록 **독립적으로 처리**(ability만 옵셔널, 실패 시 그래프 영역만 숨김/에러 표시).

### 4.2 컴포넌트

- `RadarChart.tsx` — 순수 SVG 프레젠테이션 컴포넌트. props: `axes: { label, score }[]`(3~6개). 정다각형 그리드(동심 3~4겹), 축 라인, 데이터 폴리곤(반투명 채움), 꼭짓점 라벨 + 점수. `viewBox`로 반응형, styled-components 테마 색 사용.
- `AbilityCard.tsx` — 카드 래퍼. 헤더("능력치"), 모드 배지(농구/커스텀), 레이더 차트, 표본 경고. `PlayerInfoCard`와 `StatsCard` 사이에 배치.
- 스타일은 기존 규칙대로 `styles/PlayerDetailStyles.ts`에 추가.

### 4.3 엣지/UX

- `hasData === false`(참여 게임 0 또는 그룹 표본 없음): 그래프 대신 "능력치를 계산할 기록이 부족합니다" 안내.
- `gamesPlayed`가 적을 때(예: `< 3`): 그래프는 그리되 "표본 N경기 — 참고용" 캡션.
- `score`가 null인 축(groupSize<=1): 그래프는 rawPerGame 기반 상대 스케일로 그리기 어려우므로, 이 경우 레이더 대신 원값 목록으로 폴백 표시.
- 각 꼭짓점에 label과 함께 score(또는 원값)를 표기해 그래프 형태만으로 오독되지 않게 한다.

### 4.4 접근성/일관성

- 색은 styled-components 테마 팔레트 재사용(하드코딩 최소화). 다크/라이트 대응은 기존 페이지 정책을 따른다.
- SVG에 `role="img"` + `aria-label`로 6축 요약 텍스트 제공.

## 5. 범위 밖 (YAGNI)

- 시즌/기간 필터, 다른 선수와의 오버레이 비교, 능력치 히스토리 추이 — 이번 범위 아님.
- logitem `value` 재설계, 새 기록 항목 추가 — 하지 않음.
- 능력치 캐싱/집계 테이블 — 현재 데이터 규모에서 온디맨드 집계로 충분. 성능 이슈 발생 시 후속 과제.

## 6. 리스크

- **그룹 표본이 작다**: 소규모 그룹에서 백분위는 변별력이 낮다 → 원값 병기 + 표본 캡션으로 완화.
- **커스텀 그룹 다양성**: 동적 폴백이 있으나 "높을수록 좋음" 가정이 커스텀 항목(예: 커스텀 '파울')에 안 맞을 수 있음 — 이번 범위에서는 감수(표준 농구 그룹이 대다수).
- **synchronize:true**: 신규 엔티티/컬럼 추가는 없으므로 스키마 영향 없음(읽기 전용 집계 API).
