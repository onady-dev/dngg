# 선수 전환 콤보박스 구현 계획

**Goal:** 선수 상세 페이지에서 같은 그룹 다른 선수를 검색·선택해 이동.

**Tech:** Next.js 14 App Router + styled-components, 의존성 추가 없음. 프론트 테스트 러너 없음 → `pnpm build` + 브라우저 스모크로 검증.

## Global Constraints

- 프론트 명령은 `frontend/`에서 pnpm. 검증은 `pnpm build`(빌드 중 실행 중 `next dev` 있으면 `.next` 충돌 — dev 정지 후 빌드).
- 커밋 로컬만, main 푸시=운영 배포. 커밋 메시지 한글, 타입 접두어 영문.
- 그룹 선수 페치는 독립 처리(실패해도 페이지 정상).

## Task 1: 타입 + 스타일

**Files:** `frontend/src/app/player/[id]/types.ts`, `styles/PlayerDetailStyles.ts` (수정)

- `types.ts`에 `GroupPlayer { id:number; name:string; backnumber?:string|number|null; position?:string|null }` 추가.
- `PlayerDetailStyles.ts`에 콤보박스 스타일 추가: 래퍼(relative), 입력창, 드롭다운(absolute, 스크롤, box-shadow), 항목(hover/active 하이라이트), "결과 없음" 문구.
- 검증: `pnpm build`.

## Task 2: PlayerSwitcher 컴포넌트

**Files:** `frontend/src/app/player/[id]/PlayerSwitcher.tsx` (신규)

- `"use client"`. props `{ players: GroupPlayer[]; currentPlayerId: number }`.
- 상태: `query`(검색어), `open`(드롭다운), `highlight`(하이라이트 인덱스).
- 현재 선수 제외 + `query`로 이름 필터(대소문자 무시). `players`에 다른 선수 없으면 `null` 반환.
- `useRouter().push('/player/${id}')`로 이동(선택 시 입력 초기화·닫기).
- 키보드: ↑/↓ highlight 이동, Enter 선택, Esc 닫기.
- 바깥 클릭 닫기: `useRef` + `document` mousedown 리스너(`useEffect` cleanup).
- 결과 0건 시 "일치하는 선수가 없습니다" 항목.
- 검증: `pnpm build`(미사용 상태로도 컴파일).

## Task 3: 데이터 페치 + 페이지 통합

**Files:** `PlayerDetail.tsx`, `PlayerDetailClient.tsx` (수정)

- `PlayerDetail.tsx`: `player`를 먼저 받은 뒤(이미 그러함) 그 `groupId`로 `api.get('/player?groupId=${playerData.groupId}')`를 **독립 호출**(`.then`으로 `setGroupPlayers`, `.catch`로 `setGroupPlayers([])`). `groupPlayers` state 추가, `PlayerDetailClient`에 전달.
- `PlayerDetailClient.tsx`: props에 `groupPlayers: GroupPlayer[]` 추가, `PlayerInfoCard`의 `PlayerHeader` 아래에 `<PlayerSwitcher players={groupPlayers} currentPlayerId={player.id} />` 렌더.
- 검증: `pnpm build` + 브라우저 스모크(검색·이동·키보드·바깥클릭·결과없음).

## Task 4: 최종 검증

- `frontend pnpm build` 성공, 브라우저에서 `/player/1` → 콤보박스로 다른 선수 검색·이동 확인.
