# 그룹 기반 쓰기 권한 제어 설계

날짜: 2026-07-13
상태: 승인됨 (읽기는 허용, 쓰기만 차단 정책)

## 문제

- 홈 화면의 "진행 중인 경기" 배너가 로그인 계정의 소속 그룹과 무관하게 노출된다.
- `record/[id]` 페이지는 로그인 여부(`!user`)만 확인해 타 그룹 계정으로도 기록 입력이 가능하다.
- 백엔드 `game`/`log`/`player`/`logitem` 컨트롤러는 JWT 유효성만 검사하고 그룹 소유권을 검증하지 않는다.
  URL 또는 API 직접 호출로 타 그룹의 데이터를 생성·수정·삭제할 수 있다.
- `team` 컨트롤러만 `assertOwnGroup` 검증이 존재한다.

## 정책 결정

- 읽기(GET, 페이지 접근)는 비로그인 포함 모두 허용 (기존 공개 조회 UX 유지).
- 쓰기는 "로그인 + JWT의 groupId == 대상 리소스의 groupId"일 때만 허용.
- 홈의 진행중 경기 배너는 내 소속 그룹을 선택한 경우에만 노출.

## 변경 사항

### 백엔드 (핵심 방어선) — 기존 team 컨트롤러 패턴 확장

1. `game.controller.ts`
   - `POST /game`: DTO `groupId` != JWT `groupId` → 403
   - `PATCH /game/:id`, `DELETE /game/:id`: 서비스에서 게임 조회 후 `game.groupId` != JWT `groupId` → 403
     (DELETE의 쿼리 `groupId`는 신뢰하지 않고 JWT 값 사용)
2. `log.controller.ts`
   - `POST /log`: DTO `groupId` 비교 + 대상 게임의 실제 `groupId` 확인
   - `DELETE /log/game/:id/undo`, `POST /log/game/:id/redo`: 게임 조회 후 그룹 비교
3. `player.controller.ts`
   - `POST`: DTO `groupId` 비교
   - `PUT /:id`, `DELETE /:id`: 선수 조회 후 소유 그룹 비교
4. `logitem.controller.ts`
   - `POST`: DTO `groupId` 비교

공통 검증 유틸을 만들어 컨트롤러/서비스에서 재사용한다.

### 프론트엔드 (UX)

5. 홈 `page.tsx`: 진행중 경기 배너를 `user && user.groupId === selectedGroup`일 때만 조회·렌더
6. `record/[id]/page.tsx`: 쓰기 조건을 `!!user && user.groupId === game.groupId`로 변경,
   타 그룹 계정에는 조회 전용 안내 표시
7. games/teams: 페이지 접근(읽기) 유지, 쓰기 핸들러의 `canManage` 누락 보완

## 테스트

- 백엔드: 타 그룹 groupId로 쓰기 시 403을 확인하는 단위 테스트
- 프론트: 배너/버튼 노출 조건 수동 확인

## 변경하지 않는 것

- 읽기(GET) 엔드포인트, 비로그인 조회 전용 UX, 그룹 선택 기능
