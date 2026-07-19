# 선수 상세 페이지 선수 전환 콤보박스 — 설계

- 작성일: 2026-07-19
- 대상: `frontend/src/app/player/[id]`
- 상태: 설계 승인됨

## 목적

선수 상세(능력치) 페이지에서 같은 그룹의 다른 선수를 검색·선택해 즉시 그 선수 페이지로 이동하는 기능. 현재는 페이지 간 이동 수단이 없어 매번 목록 페이지를 거쳐야 한다.

## UX

- `PlayerInfoCard`(상단, 선수명/배지 아래)에 검색 가능 콤보박스를 둔다.
- 텍스트 입력 → 같은 그룹 선수 이름으로 실시간 필터 → 매칭 목록 드롭다운 → 항목 선택 시 `/player/[id]`로 이동.
- 현재 선수는 목록에서 제외한다.
- 키보드: ↑/↓ 항목 이동, Enter 선택, Esc 닫기. 바깥 클릭 시 닫힘.
- 검색 결과 없으면 "일치하는 선수가 없습니다" 표시.
- 같은 그룹에 다른 선수가 없으면 콤보박스를 렌더하지 않는다.
- 의존성 추가 없이 순수 React + styled-components로 구현.

## 데이터 흐름

- `PlayerDetail.tsx`가 이미 `player.groupId`를 확보하므로, 그 값으로 `GET /player?groupId=${groupId}`를 호출해 그룹 선수 목록을 받는다.
- 이 호출은 **독립 처리**한다(능력치 페치와 동일 원칙): 실패해도 페이지 나머지 렌더에 영향 없이 콤보박스만 숨긴다.
- 결과를 `groupPlayers` prop으로 `PlayerDetailClient` → `PlayerSwitcher`에 전달.

## 컴포넌트

- 신규 `PlayerSwitcher.tsx` — props: `players: GroupPlayer[]`, `currentPlayerId: number`. 내부에 검색어·열림·하이라이트 인덱스 상태. `useRouter`로 이동. 바깥 클릭 감지는 `useRef` + document mousedown 리스너.
- `PlayerDetailClient` — `PlayerInfoCard` 내부에 `<PlayerSwitcher>` 렌더. `groupPlayers` prop 추가.
- `PlayerDetail.tsx` — 그룹 선수 목록 페치 추가(독립), `groupPlayers` state, prop 전달.
- 스타일은 `styles/PlayerDetailStyles.ts`에 추가(기존 흰 카드/파랑 강조 패턴).

## 타입

```ts
interface GroupPlayer {
  id: number;
  name: string;
  backnumber?: string | number | null;
  position?: string | null;
}
```
`GET /player?groupId=`는 Player 엔티티 배열을 반환하며 `id`, `name`이 항상 존재. `backnumber`/`position`은 표시에만 쓰고 없어도 무방.

## 네비게이션

선택 시 `router.push('/player/${id}')`. `PlayerDetail`의 `useEffect(deps:[playerId])`가 param 변경을 감지해 자동 재조회한다.

## 에러/엣지

- 그룹 선수 목록 페치 실패 → `groupPlayers` 빈 배열 → 콤보박스 미표시. 페이지 정상.
- 현재 선수 제외 후 0명 → 미표시.
- 검색 결과 0건 → 드롭다운에 "일치하는 선수가 없습니다".

## 범위 밖 (YAGNI)

- 그룹 간 이동(다른 그룹 선수 선택), 최근 본 선수, 즐겨찾기 — 하지 않음.
- 서버측 검색 API — 클라이언트 필터로 충분(그룹당 수십 명).

## 테스트

프론트 컴포넌트 테스트 러너 없음 → `pnpm build`(tsc) + 브라우저 스모크(검색 필터·클릭 이동·키보드 ↑↓/Enter/Esc·바깥 클릭·결과 없음).
