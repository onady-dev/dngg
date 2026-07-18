# 쿼터 태깅 + 팀파울 표시 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게임 로그에 발생 쿼터를 서버가 스탬프하고, 기록 화면에 쿼터 전환 UI와 현재 쿼터 팀파울 카운트를 표시한다.

**Architecture:** `Game.currentQuarter`가 현재 쿼터의 단일 진실(서버). 로그 생성 시 `LogService`가 게임의 현재 쿼터를 `Log.quarter`에 찍는다(클라이언트는 쿼터를 전송하지 않음). 쿼터 전환은 `PATCH /game/:id/quarter`. 프론트는 기존처럼 로그를 순회해 팀파울(`logitem.name === "파울"` && 현재 쿼터)을 계산·표시한다.

**Tech Stack:** NestJS 11 + TypeORM(`synchronize: true`) + Jest / Next.js 14 + styled-components

**Spec:** `docs/superpowers/specs/2026-07-18-quarter-teamfoul-design.md`

## Global Constraints

- 커밋 메시지 설명은 한글, conventional 타입 접두어는 영문 (`feat:`, `fix:` …).
- 명령은 각 앱 디렉토리(`backend/`, `frontend/`) 안에서 pnpm으로 실행.
- **main에 푸시하면 운영 배포된다** — 이 계획의 커밋은 전부 로컬에만 만들고, 푸시는 사용자 확인 후에만.
- `Log.player` relation은 null일 수 있음 — 이 계획의 코드는 relation을 사용하지 않으므로 영향 없음.
- 기존 로그의 `quarter`는 `null`로 남긴다(백필 금지). 조회 측은 `null`을 1쿼터로 간주.
- FK를 새로 만들지 말 것 (프로젝트 정책).

---

### Task 1: 백엔드 — `Game.currentQuarter` 컬럼 + 쿼터 전환 API

**Files:**
- Modify: `backend/src/entities/Game.entity.ts`
- Modify: `backend/src/modules/game/game.request.dto.ts`
- Modify: `backend/src/modules/game/game.controller.ts`
- Modify: `backend/src/modules/game/game.service.ts` (updateGameQuarter 추가, getGameById 응답에 currentQuarter 포함)
- Modify: `backend/src/repository/game.repository.ts`
- Test: `backend/src/modules/game/game.service.quarter.spec.ts` (신규)

**Interfaces:**
- Consumes: `findOwnedGame` (`src/common/group-access.ts`) — `GameService.assertGameInGroup(gameId, userGroupId)`가 이미 게임을 반환함.
- Produces:
  - `Game.currentQuarter: number` (int, default 1) — Task 2의 로그 스탬프가 읽음.
  - `GameService.updateGameQuarter(id: number, quarter: number, userGroupId: number): Promise<Game | null>`
  - `PATCH /game/:id/quarter` body `{ quarter: number }` (1~10) — Task 3의 프론트가 호출.
  - `GET /game/:id` 응답에 `currentQuarter` 필드 추가.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/modules/game/game.service.quarter.spec.ts` 생성:

```ts
import {
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { GameService } from './game.service';

// 쿼터 전환에 필요한 최소 스텁만 구성한다.
const createService = (
  game: { id: number; groupId: number; status: string } | null,
) => {
  const gameRepository = {
    findOne: jest.fn().mockResolvedValue(game),
    updateGameQuarter: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const service = new GameService(
    gameRepository as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, gameRepository };
};

describe('GameService.updateGameQuarter', () => {
  const OWN_GROUP = 1;
  const OTHER_GROUP = 2;
  const GAME_ID = 10;

  test('내 그룹의 진행 중 게임이면 쿼터를 갱신한다', async () => {
    const { service, gameRepository } = createService({
      id: GAME_ID,
      groupId: OWN_GROUP,
      status: 'IN_PROGRESS',
    });

    await service.updateGameQuarter(GAME_ID, 2, OWN_GROUP);

    expect(gameRepository.updateGameQuarter).toHaveBeenCalledWith(GAME_ID, 2);
  });

  test('종료된 게임이면 400을 던진다', async () => {
    const { service, gameRepository } = createService({
      id: GAME_ID,
      groupId: OWN_GROUP,
      status: 'FINISHED',
    });

    await expect(
      service.updateGameQuarter(GAME_ID, 2, OWN_GROUP),
    ).rejects.toThrow(HttpException);
    expect(gameRepository.updateGameQuarter).not.toHaveBeenCalled();
  });

  test('다른 그룹의 게임이면 ForbiddenException을 던진다', async () => {
    const { service, gameRepository } = createService({
      id: GAME_ID,
      groupId: OTHER_GROUP,
      status: 'IN_PROGRESS',
    });

    await expect(
      service.updateGameQuarter(GAME_ID, 2, OWN_GROUP),
    ).rejects.toThrow(ForbiddenException);
    expect(gameRepository.updateGameQuarter).not.toHaveBeenCalled();
  });

  test('게임이 없으면 NotFoundException을 던진다', async () => {
    const { service } = createService(null);

    await expect(
      service.updateGameQuarter(GAME_ID, 2, OWN_GROUP),
    ).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pnpm test -- src/modules/game/game.service.quarter.spec.ts`
Expected: FAIL — `service.updateGameQuarter is not a function`

- [ ] **Step 3: 구현**

`backend/src/entities/Game.entity.ts` — `status` 컬럼 아래에 추가:

```ts
  @Column('int', { default: 1 })
  currentQuarter: number;
```

`backend/src/repository/game.repository.ts` — `updateGameStatus` 아래에 추가:

```ts
  async updateGameQuarter(id: number, quarter: number) {
    return this.gameRepository.update(id, { currentQuarter: quarter });
  }
```

`backend/src/modules/game/game.request.dto.ts` — import에 `IsInt`, `Max`, `Min` 추가 후 클래스 추가:

```ts
export class PatchGameQuarterRequestDto {
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  @Max(10)
  quarter: number;
}
```

`backend/src/modules/game/game.service.ts` — `HttpStatus`는 이미 import되어 있음. `updateGameStatus` 아래에 추가:

```ts
  async updateGameQuarter(id: number, quarter: number, userGroupId: number) {
    const game = await this.assertGameInGroup(id, userGroupId);
    // 진행 중인 게임만 쿼터 전환을 허용한다 (FINISHED/DELETED 거부).
    if (game.status !== 'IN_PROGRESS') {
      throw new HttpException(
        '진행 중인 게임만 쿼터를 변경할 수 있습니다.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.gameRepository.updateGameQuarter(id, quarter);
    return this.gameRepository.findOne({ where: { id } });
  }
```

같은 파일 `getGameById`의 반환 객체에 한 줄 추가 (`status: game.status,` 위):

```ts
      currentQuarter: game.currentQuarter,
```

`backend/src/modules/game/game.controller.ts` — import에 `PatchGameQuarterRequestDto` 추가, `@Patch(':id')` 핸들러 아래에 추가:

```ts
  @Patch(':id/quarter')
  @UseGuards(AuthGuard('jwt'))
  async updateGameQuarter(
    @Request() req,
    @Param('id') id: number,
    @Body(ValidationPipe) dto: PatchGameQuarterRequestDto,
  ) {
    return this.gameService.updateGameQuarter(id, dto.quarter, req.user.groupId);
  }
```

(quarter 범위 1~10은 ValidationPipe가 DTO 데코레이터로 거부하므로 서비스 테스트 대상 아님.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && pnpm test -- src/modules/game/game.service.quarter.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 기존 테스트 회귀 확인**

Run: `cd backend && pnpm test -- src/modules/game`
Expected: 전부 PASS (gating, group-access 포함)

- [ ] **Step 6: 커밋**

```bash
git add backend/src/entities/Game.entity.ts backend/src/repository/game.repository.ts backend/src/modules/game/
git commit -m "feat: 게임 현재 쿼터 컬럼 및 쿼터 전환 API 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 백엔드 — `Log.quarter` 컬럼 + 로그 생성 시 쿼터 스탬프

**Files:**
- Modify: `backend/src/entities/Log.entity.ts`
- Modify: `backend/src/modules/log/log.service.ts`
- Test: `backend/src/modules/log/log.service.quarter.spec.ts` (신규)

**Interfaces:**
- Consumes: Task 1의 `Game.currentQuarter`.
- Produces: `Log.quarter: number | null` — `POST /log` 응답(생성된 로그)에 포함되어 Task 3·4의 프론트가 사용. `redoLog`는 원본 로그의 `quarter`를 유지(기존 `...log` 스프레드가 자동 복사 — 회귀 방지 테스트만 추가).

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/modules/log/log.service.quarter.spec.ts` 생성 (기존 `log.service.group-access.spec.ts`의 스텁 패턴 재사용):

```ts
import { LogService } from './log.service';

// 쿼터 스탬프 검증에 필요한 최소 스텁만 구성한다.
const createService = (game: {
  id: number;
  groupId: number;
  currentQuarter?: number;
}) => {
  const logRepository = {
    findLastLogByGameId: jest.fn().mockResolvedValue({ id: 5, sequence: 3 }),
    createLog: jest.fn().mockResolvedValue({ id: 6 }),
    findLogByGameIdAndSequence: jest
      .fn()
      .mockResolvedValue({ id: 4, sequence: 2, quarter: 2 }),
  };
  const gameRepository = {
    findOne: jest.fn().mockResolvedValue(game),
  };
  const dataSource = {
    getRepository: jest.fn().mockReturnValue({
      count: jest.fn().mockResolvedValue(1),
    }),
  };
  const service = new LogService(
    logRepository as any,
    gameRepository as any,
    dataSource as any,
  );
  return { service, logRepository };
};

describe('LogService 쿼터 스탬프', () => {
  const GROUP = 1;
  const GAME_ID = 10;
  const dto = { groupId: GROUP, gameId: GAME_ID, playerId: 100, logitemId: 200 };

  test('createLog는 게임의 currentQuarter를 로그에 찍는다', async () => {
    const { service, logRepository } = createService({
      id: GAME_ID,
      groupId: GROUP,
      currentQuarter: 3,
    });

    await service.createLog(dto as any, GROUP);

    expect(logRepository.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ quarter: 3 }),
    );
  });

  test('currentQuarter가 없는 게임(레거시)은 1쿼터로 찍는다', async () => {
    const { service, logRepository } = createService({
      id: GAME_ID,
      groupId: GROUP,
    });

    await service.createLog(dto as any, GROUP);

    expect(logRepository.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ quarter: 1 }),
    );
  });

  test('redoLog는 원본 로그의 quarter를 유지한다', async () => {
    const { service, logRepository } = createService({
      id: GAME_ID,
      groupId: GROUP,
      currentQuarter: 4,
    });

    await service.redoLog(GAME_ID, 2, GROUP);

    expect(logRepository.createLog).toHaveBeenCalledWith(
      expect.objectContaining({ quarter: 2 }),
    );
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && pnpm test -- src/modules/log/log.service.quarter.spec.ts`
Expected: FAIL — `createLog`가 `quarter` 없이 호출됨 (objectContaining 불일치)

- [ ] **Step 3: 구현**

`backend/src/entities/Log.entity.ts` — `sequence` 컬럼 아래에 추가:

```ts
  @Column('int', { nullable: true })
  quarter: number | null;
```

`backend/src/modules/log/log.service.ts` 수정 두 곳:

`assertGameInGroup`이 게임을 반환하도록 변경:

```ts
  // 대상 게임이 요청자의 소속 그룹 소유인지 검증하고 게임을 반환한다.
  private async assertGameInGroup(gameId: number, userGroupId: number) {
    return findOwnedGame(this.gameRepository, gameId, userGroupId);
  }
```

`createLog` 전체를 다음으로 교체 (변경점: 첫 줄에서 게임을 받아오고, `plainToInstance`에 `quarter` 추가 — 중간의 선수/기록 항목 그룹 검증 두 블록은 기존 코드와 동일):

```ts
  async createLog(log: PostLogRequestDto, userGroupId: number) {
    // DTO의 groupId가 아닌 게임의 실제 소유 그룹으로 검증한다.
    const game = await this.assertGameInGroup(log.gameId, userGroupId);

    // 선수/기록 항목도 요청자 그룹 소속인지 검증한다.
    await assertIdsInGroup(
      this.dataSource.getRepository(PlayerEntity),
      [log.playerId],
      userGroupId,
      '다른 그룹의 선수는 사용할 수 없습니다.',
    );
    await assertIdsInGroup(
      this.dataSource.getRepository(Logitem),
      [log.logitemId],
      userGroupId,
      '다른 그룹의 기록 항목은 사용할 수 없습니다.',
    );

    // 현재 게임의 마지막 시퀀스 번호 조회
    const lastLog = await this.logRepository.findLastLogByGameId(log.gameId);
    const sequence = lastLog ? lastLog.sequence + 1 : 1;

    // 쿼터는 클라이언트가 아닌 서버(게임의 현재 쿼터)가 결정한다.
    const logInstance = plainToInstance(Log, {
      ...log,
      sequence,
      quarter: game.currentQuarter ?? 1,
    });
    return this.logRepository.createLog(logInstance);
  }
```

`redoLog`는 수정 불필요 — `plainToInstance(Log, { ...log, ... })`의 스프레드가 원본 `quarter`를 이미 복사한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && pnpm test -- src/modules/log`
Expected: PASS — quarter.spec 3건 + 기존 group-access.spec 전부

- [ ] **Step 5: 백엔드 전체 테스트·린트**

Run: `cd backend && pnpm test && pnpm lint`
Expected: 전부 PASS, 린트 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add backend/src/entities/Log.entity.ts backend/src/modules/log/
git commit -m "feat: 로그 생성 시 게임 현재 쿼터를 서버가 스탬프

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 프론트 — 쿼터 표시줄·전환 UI

**Files:**
- Modify: `frontend/src/types/game.ts`
- Modify: `frontend/src/app/record/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `PATCH /game/:id/quarter`, `GET /game/:id`의 `currentQuarter`; Task 2의 `POST /log` 응답 `quarter`.
- Produces: `formatQuarter(q: number | null | undefined): string` 헬퍼 (Task 4의 히스토리 라벨이 재사용), `game.currentQuarter` 로컬 상태 규약 (`?? 1` 폴백).

- [ ] **Step 1: 타입 추가**

`frontend/src/types/game.ts`:

```ts
export interface Game {
  // ...기존 필드 유지...
  currentQuarter?: number; // 백엔드 미배포 시 undefined → 1로 간주
}

export interface Log {
  // ...기존 필드 유지...
  quarter?: number | null; // 구 로그는 null → 1쿼터로 간주
}
```

(기존 필드는 그대로 두고 두 줄만 추가.)

- [ ] **Step 2: 쿼터 UI 구현**

`frontend/src/app/record/[id]/page.tsx`:

styled-components 추가 (`SwapButton` 정의 아래):

```tsx
const QuarterBar = styled.div`
  display: flex;
  gap: 0.375rem;
  margin-top: 0.5rem;
  align-items: center;
`;

const QuarterChip = styled.button<{ isActive: boolean }>`
  padding: 0.375rem 0.75rem;
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 600;
  background-color: ${props => (props.isActive ? 'var(--primary-color)' : '#e5e7eb')};
  color: ${props => (props.isActive ? 'white' : '#374151')};
  transition: all 0.2s;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
`;
```

모듈 레벨 헬퍼 추가 (`COACHMARK_STORAGE_KEY` 아래):

```ts
// 쿼터 번호 표시: 1~4는 nQ, 5부터는 연장1, 연장2…
const formatQuarter = (q: number | null | undefined) => {
  const quarter = q ?? 1;
  return quarter <= 4 ? `${quarter}Q` : `연장${quarter - 4}`;
};
```

컴포넌트에 핸들러 추가 (`handleSwapTeams` 근처):

```ts
  const handleQuarterChange = async (quarter: number) => {
    if (!game || !canRecord || quarter === (game.currentQuarter ?? 1)) return;
    try {
      await api.patch(`/game/${game.id}/quarter`, { quarter }, {
        headers: {
          Authorization: `Bearer ${user?.accessToken}`,
        },
      });
      setGame(prev => (prev ? { ...prev, currentQuarter: quarter } : prev));
    } catch (error) {
      console.error("쿼터 변경에 실패했습니다:", error);
      showToast("쿼터 변경에 실패했습니다. 다시 시도해주세요.", "error");
    }
  };
```

렌더링 — `GameInfoHeader` 안 `ScoreDisplay`와 `SwapButton` 사이에 추가:

```tsx
        {(() => {
          const currentQuarter = game.currentQuarter ?? 1;
          const chips = Array.from(
            { length: Math.max(4, currentQuarter) },
            (_, i) => i + 1,
          );
          const quarterLocked = !canRecord || game.status !== 'IN_PROGRESS';
          return (
            <QuarterBar>
              {chips.map(q => (
                <QuarterChip
                  key={q}
                  isActive={q === currentQuarter}
                  disabled={quarterLocked}
                  onClick={() => handleQuarterChange(q)}
                >
                  {formatQuarter(q)}
                </QuarterChip>
              ))}
              {!quarterLocked && currentQuarter >= 4 && currentQuarter < 10 && (
                <QuarterChip
                  isActive={false}
                  onClick={() => handleQuarterChange(currentQuarter + 1)}
                >
                  +연장
                </QuarterChip>
              )}
            </QuarterBar>
          );
        })()}
```

`handleRecordLog`의 로컬 반영 setGame을 쿼터 보정 포함으로 교체 (다른 기록자가 쿼터를 넘긴 경우 응답의 quarter로 표시를 맞춤):

```ts
      const created = response.data;
      if (created && typeof created === "object" && "id" in created) {
        const newLog = {
          ...created,
          playerId: created.playerId ?? selectedPlayer,
          logitemId: created.logitemId ?? logItemId,
        } as Log;
        setGame(prev =>
          prev
            ? {
                ...prev,
                // 서버가 찍어준 쿼터가 로컬 표시와 다르면 서버 기준으로 보정
                currentQuarter:
                  typeof created.quarter === "number"
                    ? created.quarter
                    : prev.currentQuarter,
                logs: [...(prev.logs ?? []), newLog],
              }
            : prev,
        );
      } else {
        await fetchGameData();
      }
```

- [ ] **Step 3: 린트·빌드 확인**

Run: `cd frontend && pnpm lint && pnpm build`
Expected: 린트 에러 없음, 빌드 성공

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/types/game.ts "frontend/src/app/record/[id]/page.tsx"
git commit -m "feat: 기록 화면에 쿼터 표시줄·전환 UI 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 프론트 — 팀파울 배지 + 로그 히스토리 쿼터 라벨

**Files:**
- Modify: `frontend/src/app/record/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 3의 `formatQuarter`, `game.currentQuarter ?? 1` 규약; `Log.quarter`.
- Produces: 없음 (말단 UI).

- [ ] **Step 1: 팀파울 계산 추가**

state 추가 (`foulCount` 아래):

```ts
  const [teamFouls, setTeamFouls] = useState<{ home: number; away: number }>({
    home: 0,
    away: 0,
  });
```

스코어 계산 useEffect 확장 — 기존 파울 카운트 블록을 아래로 교체하고 마지막에 setTeamFouls 추가:

```ts
    let home = 0;
    let away = 0;
    const fouls: { [playerId: number]: number } = {};
    // 현재 쿼터의 팀별 파울 합산 (팀파울) — 쿼터가 바뀌면 0부터 다시 센다.
    const currentQuarter = game.currentQuarter ?? 1;
    let homeTeamFouls = 0;
    let awayTeamFouls = 0;

    game.logs?.forEach(log => {
      const isHomePlayer = game.homePlayers.some(p => p.id === log.playerId);
      const logItem = logItems.find(item => item.id === log.logitemId);

      if (logItem) {
        if (isHomePlayer) {
          home += logItem.value;
        } else {
          away += logItem.value;
        }
      }
      if (logItem?.name === "파울") {
        fouls[log.playerId] = (fouls[log.playerId] || 0) + 1;
        // 구 로그(quarter null)는 1쿼터로 간주
        if ((log.quarter ?? 1) === currentQuarter) {
          if (isHomePlayer) {
            homeTeamFouls += 1;
          } else {
            awayTeamFouls += 1;
          }
        }
      }
    });

    setFoulCount(fouls);
    setTeamFouls({ home: homeTeamFouls, away: awayTeamFouls });

    setHomeScore(home);
    setAwayScore(away);
```

useEffect 의존성 배열은 기존 `[game, logItems]` 그대로 (currentQuarter는 game에 포함).

- [ ] **Step 2: 팀파울 배지 표시**

styled-component 추가 (`TeamHeader` 아래):

```tsx
const TeamFoulBadge = styled.span`
  background: #fee2e2;
  color: #dc2626;
  border-radius: 999px;
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
`;
```

왼쪽 팀 `TeamHeader`의 h3 분기를 다음으로 교체 (오른쪽 팀도 `leftTeam`→`rightTeam`만 바꿔 동일 적용):

```tsx
            {selectedTeam !== leftTeam.type ? (
              <>
                <h3>{`${leftTeam.type === 'home' ? '홈팀' : '어웨이팀'} (${leftTeam.name})`}</h3>
                <TeamFoulBadge title="현재 쿼터 팀파울">
                  팀파울 {teamFouls[leftTeam.type]}
                </TeamFoulBadge>
              </>
            ) : (
              <CancelButton onClick={handleCancel}>취소</CancelButton>
            )}
```

- [ ] **Step 3: 로그 히스토리에 쿼터 라벨**

`LogHistoryActionName` 아래에 styled-component 추가:

```tsx
const LogQuarterLabel = styled.span`
  margin-left: auto;
  color: #9ca3af;
  font-size: 0.6875rem;
  flex-shrink: 0;
`;
```

히스토리 렌더링에 라벨 추가 (`LogHistoryActionName` 다음 줄):

```tsx
                <LogHistoryActionName>{log.actionName}</LogHistoryActionName>
                <LogQuarterLabel>{formatQuarter(log.quarter)}</LogQuarterLabel>
```

- [ ] **Step 4: 린트·빌드 확인**

Run: `cd frontend && pnpm lint && pnpm build`
Expected: 린트 에러 없음, 빌드 성공

- [ ] **Step 5: 커밋**

```bash
git add "frontend/src/app/record/[id]/page.tsx"
git commit -m "feat: 기록 화면에 현재 쿼터 팀파울 배지와 로그 쿼터 라벨 추가

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 통합 검증 (수동 스모크)

**Files:** 변경 없음 (검증 전용)

- [ ] **Step 1: 백엔드 전체 테스트 최종 확인**

Run: `cd backend && pnpm test`
Expected: 전부 PASS

- [ ] **Step 2: 로컬 스택 기동**

```bash
docker compose up -d db
cd backend && pnpm dev     # 터미널 1, :3010
cd frontend && pnpm dev    # 터미널 2, :3011
```

주의: `synchronize: true`라 백엔드 기동 즉시 로컬 DB에 `currentQuarter`/`quarter` 컬럼이 추가된다 (기본값 1 / null — 안전한 additive 변경).

- [ ] **Step 3: 수동 스모크 체크리스트**

1. 로그인 → 기존 게임의 기록 화면(`/record/<id>`) 진입 → 쿼터 표시줄에 `1Q`가 활성인지.
2. 선수 → 파울 기록 → 해당 팀 `팀파울 1` 증가, 히스토리에 `1Q` 라벨.
3. `2Q` 칩 탭 → 팀파울이 양 팀 모두 0으로 리셋되는지.
4. 2Q에서 파울 기록 → 팀파울 1, 히스토리 라벨 `2Q`. `1Q` 칩으로 되돌리면 1쿼터 팀파울이 다시 보이는지.
5. 새로고침 → 현재 쿼터가 `2Q`로 유지되는지 (서버 저장 확인).
6. 되돌리기 → 마지막 파울 취소 시 팀파울 감소.
7. 로그아웃(조회 전용) → 쿼터 칩 비활성, 팀파울은 표시되는지.
8. 종료된 게임에서 쿼터 칩 비활성인지.

- [ ] **Step 4: 결과 보고**

스모크 결과를 사용자에게 보고하고, **푸시(=운영 배포) 여부는 사용자 확인 후 진행**. 백엔드·프론트가 모두 변경되므로 CI에서 두 잡이 함께 빌드되어 sha 핀이 동시 갱신된다 (혼합 배포 리스크 없음).
