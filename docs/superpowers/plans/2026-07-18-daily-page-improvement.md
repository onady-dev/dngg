# Daily 페이지 개선 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** daily 페이지의 그룹 데이터 누수 버그를 수정하고, 날짜 내비게이션 + 게임 요약 카드 + 순위/정렬 테이블을 갖춘 모바일 우선 UI로 재설계하며, 데이터 계층을 TanStack Query로 전환한다.

**Architecture:** 백엔드 `log` 모듈에 daily 전용 엔드포인트 3개(`/log/daily` 수정, `/log/daily/dates` 신규, `/log/daily/games` 신규)를 두고, 날짜 경계는 모두 SQL `createdAt::date` 기준으로 통일한다. 프론트는 `daily/page.tsx`를 4개의 TanStack Query와 3개의 하위 컴포넌트(DateNavigator, GameSummaryCards, RecordsTable)로 재구성한다.

**Tech Stack:** NestJS 11 + TypeORM(PostgreSQL 15), jest(스텁 기반 단위 테스트), Next.js 14 App Router + styled-components + TanStack Query.

**Spec:** `docs/superpowers/specs/2026-07-18-daily-page-design.md`

## Global Constraints

- 커밋 메시지 설명은 **한글**, conventional commit 타입 접두어는 영문 (`fix:`, `feat:` 등).
- 패키지 매니저는 **pnpm**. 명령은 반드시 `backend/` 또는 `frontend/` 디렉토리 안에서 실행.
- **main에 푸시하면 운영 배포된다.** 이 계획의 커밋은 전부 로컬에만 하고, 푸시는 사용자 확인 후에만.
- `Log.player` relation은 null일 수 있다 (FK 의도적 제거). 이 relation을 다루는 모든 코드는 null-safe여야 하며, FK 제약을 다시 만들지 말 것.
- `synchronize: true` 상태 — 이 계획은 엔티티를 변경하지 않으므로 스키마 영향 없음. 엔티티 파일을 수정하지 말 것.
- 전역 ValidationPipe: `whitelist` + `forbidNonWhitelisted` + `transform: true`. DTO에 없는 쿼리 파라미터는 400.
- 프론트 API 호출은 `@/lib/axios`의 `api`만 사용. `src/app/lib/axios.ts`(레거시)는 import 금지.
- 백엔드 `pnpm lint`는 `--fix`라 파일을 고쳐 쓴다 — 실행 후 의도치 않은 diff가 없는지 `git diff`로 확인할 것.
- 프론트에는 테스트 러너가 없다. 프론트 태스크의 검증은 `pnpm lint` + `pnpm build` + 마지막 태스크의 수동 스모크로 한다.
- styled-components prop은 기존 코드 컨벤션대로 non-transient(`isFirst` 형태)를 따른다.
- ⚠️ **배포 주의**: `/log/daily`에 `groupId`가 필수가 되고 forbidNonWhitelisted 때문에 **구프론트+신백엔드, 신프론트+구백엔드 어느 조합이든 400**이 난다. 프론트·백엔드 커밋을 한 배포 단위로 머지하고 CI 두 잡이 모두 green인지 확인해야 한다.

---

### Task 1: 백엔드 — `/log/daily`에 groupId 필터 추가 (누수 수정)

**Files:**
- Modify: `backend/src/modules/log/log.request.dto.ts`
- Modify: `backend/src/repository/log.repository.ts:35-47` (`findByDaily`)
- Modify: `backend/src/modules/log/log.service.ts:30-58` (`getLogByDaily`)
- Modify: `backend/src/modules/log/log.controller.ts:28-31`
- Test: `backend/src/modules/log/log.service.daily.spec.ts` (신규)
- Test: `backend/src/repository/log.repository.daily.spec.ts` (신규)

**Interfaces:**
- Consumes: 기존 `LogRepository`, `LogService` 생성자 시그니처 (변경 없음)
- Produces: `LogService.getLogByDaily(dateString: string, groupId: number)`, `LogRepository.findByDaily(date: string, groupId: number): Promise<Log[] | null>`, `GetLogByDailyRequestDto { date: string; groupId: number }` — Task 2·3과 프론트 Task 7이 이 시그니처에 의존한다. 응답 형태는 기존과 동일: `{ id, name, backnumber, totalScore, logItem }[]`

- [ ] **Step 1: 서비스 실패 테스트 작성**

`backend/src/modules/log/log.service.daily.spec.ts` 생성:

```typescript
import { LogService } from './log.service';

// daily 조회 로직 검증용 최소 스텁 (log.service.quarter.spec.ts 패턴)
const GOAL = { id: 200, name: '골', value: 2 };
const ASSIST = { id: 201, name: '어시스트', value: 1 };

const makeLog = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  groupId: 1,
  gameId: 10,
  playerId: 100,
  logitemId: GOAL.id,
  logitem: GOAL,
  player: { id: 100, name: '홍길동', backnumber: '7' },
  ...overrides,
});

const createService = ({
  dailyLogs = [] as any[],
} = {}) => {
  const logRepository = {
    findByDaily: jest.fn().mockResolvedValue(dailyLogs),
  };
  const service = new LogService(
    logRepository as any,
    {} as any,
    {} as any,
  );
  return { service, logRepository };
};

describe('LogService.getLogByDaily', () => {
  test('date와 groupId를 리포지토리에 그대로 전달한다', async () => {
    const { service, logRepository } = createService();

    await service.getLogByDaily('2026-07-18', 5);

    expect(logRepository.findByDaily).toHaveBeenCalledWith('2026-07-18', 5);
  });

  test('선수별 totalScore와 항목별 count를 집계한다', async () => {
    const { service } = createService({
      dailyLogs: [
        makeLog({ id: 1 }),
        makeLog({ id: 2 }),
        makeLog({ id: 3, logitemId: ASSIST.id, logitem: ASSIST }),
      ],
    });

    const result = await service.getLogByDaily('2026-07-18', 1);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 100,
      name: '홍길동',
      totalScore: 5, // 골 2 + 골 2 + 어시스트 1
    });
    expect(result[0].logItem[GOAL.id].count).toBe(2);
    expect(result[0].logItem[ASSIST.id].count).toBe(1);
  });

  test('player가 null인 로그는 스킵한다 (FK 제거 정책)', async () => {
    const { service } = createService({
      dailyLogs: [makeLog(), makeLog({ id: 2, playerId: 999, player: null })],
    });

    const result = await service.getLogByDaily('2026-07-18', 1);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(100);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd /Users/onady/project/dngg/backend && pnpm test -- src/modules/log/log.service.daily.spec.ts`
Expected: FAIL — `findByDaily`가 `('2026-07-18', 5)`가 아니라 `(Date)` 하나로 호출되어 첫 테스트 실패 (현재 시그니처는 date 하나).

- [ ] **Step 3: 리포지토리 테스트 작성**

`backend/src/repository/log.repository.daily.spec.ts` 생성:

```typescript
import { LogRepository } from 'src/repository/log.repository';

// 실제 DB 없이 find 호출 옵션(where 절 구성)만 검증한다. (logitem.repository.spec.ts 패턴)
const createRepository = () => {
  const inner = {
    target: {},
    manager: {},
    queryRunner: undefined,
    find: jest.fn().mockResolvedValue([]),
  };
  const repository = new LogRepository(inner as any);
  return { repository, inner };
};

describe('LogRepository.findByDaily', () => {
  test('groupId 필터와 relations를 포함해 조회한다', async () => {
    const { repository, inner } = createRepository();

    await repository.findByDaily('2026-07-18', 5);

    expect(inner.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ groupId: 5 }),
        relations: ['logitem', 'player'],
      }),
    );
  });

  test('쿼리 문자열로 들어온 groupId도 숫자로 변환해 필터한다', async () => {
    const { repository, inner } = createRepository();

    await repository.findByDaily('2026-07-18', '5' as unknown as number);

    expect(inner.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ groupId: 5 }),
      }),
    );
  });
});
```

- [ ] **Step 4: 구현**

`backend/src/modules/log/log.request.dto.ts` — `GetLogByDailyRequestDto`에 groupId 추가:

```typescript
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class PostLogRequestDto {
  @IsNotEmpty()
  @IsNumber()
  groupId: number;
  @IsNotEmpty()
  @IsNumber()
  gameId: number;
  @IsNotEmpty()
  @IsNumber()
  playerId: number;
  @IsNotEmpty()
  @IsNumber()
  logitemId: number;
}

export class GetLogByDailyRequestDto {
  @IsNotEmpty()
  @IsString()
  date: string;

  @Type(() => Number)
  @IsNotEmpty()
  @IsNumber()
  groupId: number;
}
```

`backend/src/repository/log.repository.ts` — import에서 `Between` 제거하고 `Raw` 추가, `findByDaily` 교체:

```typescript
import { Like, QueryRunner, Repository, Raw } from 'typeorm';
```

```typescript
  async findByDaily(date: string, groupId: number): Promise<Log[] | null> {
    // 날짜 경계는 DB에 저장된 값의 ::date 기준으로 판정한다.
    // (/log/daily/dates 목록 생성과 같은 표현식 — 기준 불일치 방지)
    return this.logRepository.find({
      where: {
        groupId: Number(groupId),
        createdAt: Raw((alias) => `${alias}::date = :date`, { date }),
      },
      relations: ['logitem', 'player'],
    });
  }
```

`backend/src/modules/log/log.service.ts` — `getLogByDaily` 시그니처 변경 (본문 집계 로직은 그대로):

```typescript
  async getLogByDaily(dateString: string, groupId: number) {
    const playerMap = new Map<number, Player>();
    const logs = await this.logRepository.findByDaily(dateString, groupId);
    logs?.forEach((log: any) => {
      if (!log.player) {
        return;
      }

      const getPlayerMap = playerMap.get(log.playerId);
      playerMap.set(log.playerId, {
        id: log.playerId,
        name: log.player.name,
        backnumber: Number(log.player.backnumber),
        totalScore: (getPlayerMap?.totalScore || 0) + log.logitem.value,
        logItem: {
          ...getPlayerMap?.logItem,
          [log.logitemId]: {
            ...log.logitem,
            count: (getPlayerMap?.logItem[log.logitemId]?.count || 0) + 1,
            value:
              (getPlayerMap?.logItem[log.logitemId]?.value || 0) +
              log.logitem.value,
          },
        },
      });
    });
    return Array.from(playerMap.values());
  }
```

`backend/src/modules/log/log.controller.ts:28-31`:

```typescript
  @Get('/daily')
  async getLogByDaily(@Query(ValidationPipe) dto: GetLogByDailyRequestDto) {
    return await this.logService.getLogByDaily(dto.date, dto.groupId);
  }
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd /Users/onady/project/dngg/backend && pnpm test -- src/modules/log/log.service.daily.spec.ts src/repository/log.repository.daily.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: 기존 테스트 회귀 확인**

Run: `cd /Users/onady/project/dngg/backend && pnpm test`
Expected: 전체 PASS (기존 quarter/group-access 스펙 포함)

- [ ] **Step 7: 커밋**

```bash
cd /Users/onady/project/dngg
git add backend/src/modules/log/ backend/src/repository/
git commit -m "fix: 일일 기록 조회에 groupId 필터 추가로 타 그룹 데이터 누수 수정"
```

---

### Task 2: 백엔드 — `GET /log/daily/dates` (로그가 있는 날짜 목록)

**Files:**
- Modify: `backend/src/repository/log.repository.ts` (`findDailyDates` 추가)
- Modify: `backend/src/modules/log/log.service.ts` (`getDailyDates` 추가)
- Modify: `backend/src/modules/log/log.request.dto.ts` (`GetDailyDatesRequestDto` 추가)
- Modify: `backend/src/modules/log/log.controller.ts` (`/daily/dates` 라우트 추가)
- Test: `backend/src/modules/log/log.service.daily.spec.ts` (테스트 추가)

**Interfaces:**
- Consumes: Task 1의 `LogRepository`/`LogService` 구조
- Produces: `GET /log/daily/dates?groupId=` → `string[]` (`'YYYY-MM-DD'` 최신순). `LogService.getDailyDates(groupId: number)`, `LogRepository.findDailyDates(groupId: number): Promise<string[]>` — 프론트 Task 7의 `['daily-dates', groupId]` 쿼리가 이 응답 형태에 의존.

- [ ] **Step 1: 실패 테스트 작성**

`log.service.daily.spec.ts`의 `createService` 스텁에 `findDailyDates`를 추가하고 describe 블록 추가:

```typescript
const createService = ({
  dailyLogs = [] as any[],
  dates = [] as string[],
} = {}) => {
  const logRepository = {
    findByDaily: jest.fn().mockResolvedValue(dailyLogs),
    findDailyDates: jest.fn().mockResolvedValue(dates),
  };
  const service = new LogService(
    logRepository as any,
    {} as any,
    {} as any,
  );
  return { service, logRepository };
};
```

```typescript
describe('LogService.getDailyDates', () => {
  test('그룹의 로그 날짜 목록을 리포지토리에서 그대로 반환한다', async () => {
    const { service, logRepository } = createService({
      dates: ['2026-07-18', '2026-07-15'],
    });

    const result = await service.getDailyDates(5);

    expect(logRepository.findDailyDates).toHaveBeenCalledWith(5);
    expect(result).toEqual(['2026-07-18', '2026-07-15']);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd /Users/onady/project/dngg/backend && pnpm test -- src/modules/log/log.service.daily.spec.ts`
Expected: FAIL — `service.getDailyDates is not a function`

- [ ] **Step 3: 구현**

`backend/src/repository/log.repository.ts`에 메서드 추가 (`findByDaily` 바로 아래):

```typescript
  async findDailyDates(groupId: number): Promise<string[]> {
    // 로그가 실제 존재하는 날짜만, findByDaily와 같은 ::date 기준으로 뽑는다.
    const rows: { date: string }[] = await this.logRepository
      .createQueryBuilder('log')
      .select(`DISTINCT TO_CHAR(log.createdAt::date, 'YYYY-MM-DD')`, 'date')
      .where('log.groupId = :groupId', { groupId: Number(groupId) })
      .orderBy('date', 'DESC')
      .getRawMany();
    return rows.map((row) => row.date);
  }
```

`backend/src/modules/log/log.service.ts`에 추가 (`getLogByDaily` 아래):

```typescript
  async getDailyDates(groupId: number) {
    return this.logRepository.findDailyDates(groupId);
  }
```

`backend/src/modules/log/log.request.dto.ts`에 추가:

```typescript
export class GetDailyDatesRequestDto {
  @Type(() => Number)
  @IsNotEmpty()
  @IsNumber()
  groupId: number;
}
```

`backend/src/modules/log/log.controller.ts` — import에 `GetDailyDatesRequestDto` 추가하고, `@Get('/daily')` 바로 아래·`@Get('/game/:id')` 위에 라우트 추가 (파라미터 라우트보다 먼저 선언):

```typescript
  @Get('/daily/dates')
  async getDailyDates(@Query(ValidationPipe) dto: GetDailyDatesRequestDto) {
    return this.logService.getDailyDates(dto.groupId);
  }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /Users/onady/project/dngg/backend && pnpm test -- src/modules/log/log.service.daily.spec.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
cd /Users/onady/project/dngg
git add backend/src/modules/log/ backend/src/repository/
git commit -m "feat: 로그가 존재하는 날짜 목록 API 추가 (GET /log/daily/dates)"
```

---

### Task 3: 백엔드 — `GET /log/daily/games` (게임 요약)

**Files:**
- Modify: `backend/src/repository/log.repository.ts` (`findDailyLogsWithGame` 추가)
- Modify: `backend/src/modules/log/types.d.ts` (`GameSummary` 타입 추가)
- Modify: `backend/src/modules/log/log.service.ts` (`getDailyGames` 추가)
- Modify: `backend/src/modules/log/log.controller.ts` (`/daily/games` 라우트 추가)
- Test: `backend/src/modules/log/log.service.daily.spec.ts` (테스트 추가)

**Interfaces:**
- Consumes: Task 1의 `GetLogByDailyRequestDto`(재사용 — 같은 `{date, groupId}` 형태), `InGamePlayer` 엔티티(`team: 'home' | 'away'`), `LogService`에 이미 주입된 `dataSource`
- Produces: `GET /log/daily/games?date=&groupId=` → `{ id, homeTeamName, awayTeamName, homeScore, awayScore, status }[]`. `LogService.getDailyGames(dateString: string, groupId: number)` — 프론트 Task 5·7의 `GameSummary` 타입이 이 응답에 의존.

- [ ] **Step 1: 실패 테스트 작성**

`log.service.daily.spec.ts` — 스텁을 최종 형태로 확장:

```typescript
const createService = ({
  dailyLogs = [] as any[],
  gameLogs = [] as any[],
  dates = [] as string[],
  inGamePlayers = [] as any[],
} = {}) => {
  const logRepository = {
    findByDaily: jest.fn().mockResolvedValue(dailyLogs),
    findDailyLogsWithGame: jest.fn().mockResolvedValue(gameLogs),
    findDailyDates: jest.fn().mockResolvedValue(dates),
  };
  const inGamePlayerRepository = {
    find: jest.fn().mockResolvedValue(inGamePlayers),
  };
  const dataSource = {
    getRepository: jest.fn().mockReturnValue(inGamePlayerRepository),
  };
  const service = new LogService(
    logRepository as any,
    {} as any,
    dataSource as any,
  );
  return { service, logRepository, inGamePlayerRepository };
};
```

게임 로그 픽스처 헬퍼와 describe 블록 추가:

```typescript
const FINISHED_GAME = {
  id: 10,
  homeTeamName: '홈팀',
  awayTeamName: '어웨이팀',
  status: 'FINISHED',
};

const makeGameLog = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  groupId: 1,
  gameId: 10,
  playerId: 100,
  logitemId: GOAL.id,
  logitem: GOAL,
  player: { id: 100, name: '홍길동' },
  game: FINISHED_GAME,
  ...overrides,
});

describe('LogService.getDailyGames', () => {
  test('InGamePlayer team 기준으로 홈/어웨이 스코어를 합산한다', async () => {
    const { service } = createService({
      gameLogs: [
        makeGameLog({ id: 1, playerId: 100 }), // home, 골 +2
        makeGameLog({ id: 2, playerId: 100, logitemId: ASSIST.id, logitem: ASSIST }), // home, +1
        makeGameLog({ id: 3, playerId: 101, player: { id: 101, name: '김철수' } }), // away, +2
      ],
      inGamePlayers: [
        { gameId: 10, playerId: 100, team: 'home' },
        { gameId: 10, playerId: 101, team: 'away' },
      ],
    });

    const result = await service.getDailyGames('2026-07-18', 1);

    expect(result).toEqual([
      {
        id: 10,
        homeTeamName: '홈팀',
        awayTeamName: '어웨이팀',
        homeScore: 3,
        awayScore: 2,
        status: 'FINISHED',
      },
    ]);
  });

  test('player가 null이거나 팀 매칭이 없는 로그는 스코어에서 제외하되 게임은 포함한다', async () => {
    const { service } = createService({
      gameLogs: [
        makeGameLog({ id: 1, playerId: 999, player: null }), // 삭제된 선수
        makeGameLog({ id: 2, playerId: 102, player: { id: 102, name: '박영수' } }), // InGamePlayer 매칭 없음
      ],
      inGamePlayers: [],
    });

    const result = await service.getDailyGames('2026-07-18', 1);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 10, homeScore: 0, awayScore: 0 });
  });

  test('로그가 없으면 InGamePlayer를 조회하지 않고 빈 배열을 반환한다', async () => {
    const { service, inGamePlayerRepository } = createService({ gameLogs: [] });

    const result = await service.getDailyGames('2026-07-18', 1);

    expect(result).toEqual([]);
    expect(inGamePlayerRepository.find).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd /Users/onady/project/dngg/backend && pnpm test -- src/modules/log/log.service.daily.spec.ts`
Expected: FAIL — `service.getDailyGames is not a function`

- [ ] **Step 3: 구현**

`backend/src/repository/log.repository.ts`에 추가:

```typescript
  async findDailyLogsWithGame(
    date: string,
    groupId: number,
  ): Promise<Log[] | null> {
    return this.logRepository.find({
      where: {
        groupId: Number(groupId),
        createdAt: Raw((alias) => `${alias}::date = :date`, { date }),
      },
      relations: ['logitem', 'game', 'player'],
    });
  }
```

> **정정 (T3 리뷰 반영):** relations에 `'player'`가 반드시 포함되어야 한다. 없으면 `log.player`가 모든 행에서 undefined가 되어 null-player 스킵 가드가 전부 발동, 스코어가 항상 0:0이 된다.

`backend/src/modules/log/types.d.ts`에 추가:

```typescript
export type GameSummary = {
  id: number;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeScore: number;
  awayScore: number;
  status: string;
};
```

`backend/src/modules/log/log.service.ts` — import 추가:

```typescript
import { DataSource, In } from 'typeorm';
import { InGamePlayer } from 'src/entities/InGamePlayer.entity';
import { GameSummary, Player } from './types';
```

메서드 추가 (`getDailyDates` 아래):

```typescript
  async getDailyGames(dateString: string, groupId: number) {
    const logs = await this.logRepository.findDailyLogsWithGame(
      dateString,
      groupId,
    );
    if (!logs || logs.length === 0) {
      return [];
    }

    // 게임별 선수의 홈/어웨이 소속 매핑
    const gameIds = Array.from(new Set(logs.map((log) => log.gameId)));
    const inGamePlayers = await this.dataSource
      .getRepository(InGamePlayer)
      .find({ where: { gameId: In(gameIds), groupId: Number(groupId) } });
    const teamByGamePlayer = new Map<string, string>();
    inGamePlayers.forEach((igp) => {
      teamByGamePlayer.set(`${igp.gameId}:${igp.playerId}`, igp.team);
    });

    const gameMap = new Map<number, GameSummary>();
    logs.forEach((log) => {
      if (!log.game || log.game.status === 'DELETED') {
        return;
      }
      let summary = gameMap.get(log.gameId);
      if (!summary) {
        summary = {
          id: log.gameId,
          homeTeamName: log.game.homeTeamName,
          awayTeamName: log.game.awayTeamName,
          homeScore: 0,
          awayScore: 0,
          status: log.game.status,
        };
        gameMap.set(log.gameId, summary);
      }
      if (!log.player) {
        return; // FK 제거 정책: 삭제된 선수 로그는 스코어 합산에서 제외
      }
      const team = teamByGamePlayer.get(`${log.gameId}:${log.playerId}`);
      if (team === 'home') {
        summary.homeScore += log.logitem.value;
      } else if (team === 'away') {
        summary.awayScore += log.logitem.value;
      }
    });
    return Array.from(gameMap.values());
  }
```

`backend/src/modules/log/log.controller.ts` — `/daily/dates` 아래에 라우트 추가:

```typescript
  @Get('/daily/games')
  async getDailyGames(@Query(ValidationPipe) dto: GetLogByDailyRequestDto) {
    return this.logService.getDailyGames(dto.date, dto.groupId);
  }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd /Users/onady/project/dngg/backend && pnpm test -- src/modules/log/log.service.daily.spec.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: 전체 테스트 + 린트**

Run: `cd /Users/onady/project/dngg/backend && pnpm test && pnpm lint && git -C /Users/onady/project/dngg diff --stat`
Expected: 전체 PASS. lint --fix가 이번 변경 파일 외를 고쳐 썼다면 해당 파일은 `git checkout --`으로 되돌린다.

- [ ] **Step 6: 커밋**

```bash
cd /Users/onady/project/dngg
git add backend/src/modules/log/ backend/src/repository/
git commit -m "feat: 일일 게임 요약 API 추가 (GET /log/daily/games, 홈/어웨이 스코어 계산)"
```

---

### Task 4: 프론트 — 타입 · SectionError · DateNavigator

**Files:**
- Create: `frontend/src/app/daily/types.ts`
- Create: `frontend/src/app/daily/components/SectionError.tsx`
- Create: `frontend/src/app/daily/components/DateNavigator.tsx`

**Interfaces:**
- Consumes: 백엔드 응답 형태 (Task 1~3의 Produces)
- Produces: `PlayerRecord`, `LogItemDef`, `GameSummary` 타입. `<SectionError message onRetry />`, `<DateNavigator dates selectedDate onChange />` — Task 5~7이 사용.

- [ ] **Step 1: 타입 파일 작성**

`frontend/src/app/daily/types.ts`:

```typescript
export interface LogItemDef {
  id: number;
  name: string;
  value: number;
}

export interface PlayerRecord {
  id: number;
  name: string;
  backnumber: number;
  totalScore: number;
  logItem: {
    [id: number]: { id: number; name: string; value: number; count: number };
  };
}

export interface GameSummary {
  id: number;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeScore: number;
  awayScore: number;
  status: string;
}
```

- [ ] **Step 2: SectionError 작성**

`frontend/src/app/daily/components/SectionError.tsx`:

```tsx
"use client";

import styled from 'styled-components';

interface Props {
  message: string;
  onRetry: () => void;
}

const SectionError = ({ message, onRetry }: Props) => (
  <ErrorBox>
    <span>{message}</span>
    <RetryButton type="button" onClick={onRetry}>
      다시 시도
    </RetryButton>
  </ErrorBox>
);

const ErrorBox = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  background-color: #fee2e2;
  padding: 0.875rem 1rem;
  margin: 0.5rem 0 1rem;
  border-radius: 0.375rem;
  color: #b91c1c;
  font-size: 0.875rem;
`;

const RetryButton = styled.button`
  flex-shrink: 0;
  padding: 0.375rem 0.75rem;
  border: 1px solid #b91c1c;
  border-radius: 0.375rem;
  background: white;
  color: #b91c1c;
  font-size: 0.8125rem;
  cursor: pointer;

  &:hover {
    background: #fef2f2;
  }
`;

export default SectionError;
```

- [ ] **Step 3: DateNavigator 작성**

`frontend/src/app/daily/components/DateNavigator.tsx`:

```tsx
"use client";

import styled from 'styled-components';

interface Props {
  dates: string[]; // 최신순 정렬 전제
  selectedDate: string;
  onChange: (date: string) => void;
}

const formatDateDisplay = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

const DateNavigator = ({ dates, selectedDate, onChange }: Props) => {
  const index = dates.indexOf(selectedDate);
  const hasOlder = index >= 0 && index < dates.length - 1;
  const hasNewer = index > 0;

  return (
    <Nav>
      <ArrowButton
        type="button"
        disabled={!hasOlder}
        onClick={() => onChange(dates[index + 1])}
        aria-label="이전 날짜"
      >
        ◀
      </ArrowButton>
      <DateLabelWrapper>
        <DateLabel>{formatDateDisplay(selectedDate)}</DateLabel>
        {/* 라벨 위에 투명 select를 겹쳐 탭하면 네이티브 날짜 목록이 열린다 */}
        <HiddenSelect
          value={selectedDate}
          onChange={(e) => onChange(e.target.value)}
          aria-label="날짜 선택"
        >
          {dates.map((date) => (
            <option key={date} value={date}>
              {formatDateDisplay(date)}
            </option>
          ))}
        </HiddenSelect>
      </DateLabelWrapper>
      <ArrowButton
        type="button"
        disabled={!hasNewer}
        onClick={() => onChange(dates[index - 1])}
        aria-label="다음 날짜"
      >
        ▶
      </ArrowButton>
    </Nav>
  );
};

const Nav = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  width: 100%;

  @media (min-width: 768px) {
    width: auto;
    min-width: 320px;
  }
`;

const ArrowButton = styled.button`
  padding: 0.5rem 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  background: white;
  color: #475569;
  font-size: 0.875rem;
  cursor: pointer;

  &:disabled {
    color: #cbd5e1;
    cursor: default;
  }

  &:not(:disabled):hover {
    border-color: #3b82f6;
    color: #3b82f6;
  }
`;

const DateLabelWrapper = styled.div`
  position: relative;
  flex: 1;
  text-align: center;
`;

const DateLabel = styled.span`
  font-size: 0.9375rem;
  font-weight: 600;
  color: #1e293b;
`;

const HiddenSelect = styled.select`
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  cursor: pointer;
`;

export default DateNavigator;
```

- [ ] **Step 4: 린트 확인**

Run: `cd /Users/onady/project/dngg/frontend && pnpm lint`
Expected: 에러 없음 (경고만 있으면 통과)

- [ ] **Step 5: 커밋**

```bash
cd /Users/onady/project/dngg
git add frontend/src/app/daily/
git commit -m "feat: daily 페이지 타입 정의와 날짜 내비게이터·섹션 에러 컴포넌트 추가"
```

---

### Task 5: 프론트 — GameSummaryCards

**Files:**
- Create: `frontend/src/app/daily/components/GameSummaryCards.tsx`

**Interfaces:**
- Consumes: `GameSummary` (Task 4의 `../types`)
- Produces: `<GameSummaryCards games loading />` — Task 7의 page.tsx가 사용.

- [ ] **Step 1: 컴포넌트 작성**

`frontend/src/app/daily/components/GameSummaryCards.tsx`:

```tsx
"use client";

import styled from 'styled-components';
import { GameSummary } from '../types';

interface Props {
  games: GameSummary[];
  loading: boolean;
}

const GameSummaryCards = ({ games, loading }: Props) => {
  if (loading) {
    return <PlaceholderText>경기 요약을 불러오는 중…</PlaceholderText>;
  }
  if (games.length === 0) {
    return null;
  }

  return (
    <CardsRow>
      {games.map((game) => (
        <Card key={game.id}>
          {game.status === 'IN_PROGRESS' && <Badge>진행 중</Badge>}
          <TeamRow>
            <TeamName>{game.homeTeamName || '홈'}</TeamName>
            <Score>
              {game.homeScore}
              <Colon>:</Colon>
              {game.awayScore}
            </Score>
            <TeamName>{game.awayTeamName || '어웨이'}</TeamName>
          </TeamRow>
        </Card>
      ))}
    </CardsRow>
  );
};

const CardsRow = styled.div`
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;
  margin-bottom: 1rem;
  -webkit-overflow-scrolling: touch;

  @media (min-width: 768px) {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    overflow-x: visible;
  }
`;

const Card = styled.div`
  position: relative;
  flex: 0 0 auto;
  min-width: 220px;
  padding: 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  background: white;
`;

const Badge = styled.span`
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 0.6875rem;
  font-weight: 600;
`;

const TeamRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
`;

const TeamName = styled.span`
  flex: 1;
  font-size: 0.875rem;
  font-weight: 500;
  color: #1e293b;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Score = styled.span`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
`;

const Colon = styled.span`
  color: #94a3b8;
  font-weight: 400;
`;

const PlaceholderText = styled.p`
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: #64748b;
`;

export default GameSummaryCards;
```

- [ ] **Step 2: 린트 확인**

Run: `cd /Users/onady/project/dngg/frontend && pnpm lint`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
cd /Users/onady/project/dngg
git add frontend/src/app/daily/components/GameSummaryCards.tsx
git commit -m "feat: daily 페이지 게임 요약 카드 컴포넌트 추가"
```

---

### Task 6: 프론트 — RecordsTable (순위 + 정렬)

**Files:**
- Create: `frontend/src/app/daily/components/RecordsTable.tsx`

**Interfaces:**
- Consumes: `PlayerRecord`, `LogItemDef` (Task 4의 `../types`)
- Produces: `<RecordsTable records logItems loading />` — Task 7의 page.tsx가 사용. 순위는 totalScore 내림차순 기준 고정, 헤더 탭 정렬은 내림차순 → 오름차순 → 기본 순환.

- [ ] **Step 1: 컴포넌트 작성**

`frontend/src/app/daily/components/RecordsTable.tsx`:

```tsx
"use client";

import { useMemo, useState } from 'react';
import styled from 'styled-components';
import { LogItemDef, PlayerRecord } from '../types';

type SortKey = 'total' | number; // number = logitemId

interface SortState {
  key: SortKey;
  direction: 'desc' | 'asc';
}

interface Props {
  records: PlayerRecord[];
  logItems: LogItemDef[];
  loading: boolean;
}

const MEDALS = ['🥇', '🥈', '🥉'];
const RANK_COL_WIDTH = '3rem';

const RecordsTable = ({ records, logItems, loading }: Props) => {
  const [sort, setSort] = useState<SortState | null>(null);

  // 순위는 정렬 상태와 무관하게 totalScore 내림차순 기준으로 고정
  const rankById = useMemo(() => {
    const byTotal = [...records].sort((a, b) => b.totalScore - a.totalScore);
    const map = new Map<number, number>();
    byTotal.forEach((record, i) => map.set(record.id, i + 1));
    return map;
  }, [records]);

  const sorted = useMemo(() => {
    const base = [...records].sort((a, b) => b.totalScore - a.totalScore);
    if (!sort) {
      return base;
    }
    const count = (record: PlayerRecord, logitemId: number) =>
      record.logItem[logitemId]?.count || 0;
    const compare = (a: PlayerRecord, b: PlayerRecord) =>
      sort.key === 'total'
        ? a.totalScore - b.totalScore
        : count(a, sort.key as number) - count(b, sort.key as number);
    base.sort((a, b) =>
      sort.direction === 'desc' ? compare(b, a) : compare(a, b),
    );
    return base;
  }, [records, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: 'desc' };
      if (prev.direction === 'desc') return { key, direction: 'asc' };
      return null; // 기본 정렬(득점순)로 복귀
    });
  };

  const sortIndicator = (key: SortKey) => {
    if (!sort || sort.key !== key) return '';
    return sort.direction === 'desc' ? ' ▼' : ' ▲';
  };

  if (loading) {
    return <PlaceholderText>기록을 불러오는 중…</PlaceholderText>;
  }
  if (records.length === 0) {
    return <EmptyText>이 날짜에 기록된 선수가 없습니다.</EmptyText>;
  }

  return (
    <TableContainer>
      <Table>
        <thead>
          <tr>
            <Th isRank>#</Th>
            <Th isFirst>선수</Th>
            <Th clickable onClick={() => toggleSort('total')}>
              득점{sortIndicator('total')}
            </Th>
            {logItems.map((item) => (
              <Th key={item.id} clickable onClick={() => toggleSort(item.id)}>
                {item.name}
                {sortIndicator(item.id)}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((record) => {
            const rank = rankById.get(record.id) ?? 0;
            const topThree = rank >= 1 && rank <= 3;
            return (
              <tr key={record.id}>
                <Td isRank topThree={topThree}>
                  {topThree ? MEDALS[rank - 1] : rank}
                </Td>
                <Td isFirst topThree={topThree}>
                  <PlayerName>{record.name}</PlayerName>
                </Td>
                <Td topThree={topThree}>
                  <StatValue isPositive={record.totalScore >= 0}>
                    {record.totalScore}점
                  </StatValue>
                </Td>
                {logItems.map((item) => {
                  const count = record.logItem[item.id]?.count || 0;
                  return (
                    <Td key={item.id} topThree={topThree}>
                      <StatValue isPositive={count > 0} isNeutral={count === 0}>
                        {count > 0 ? `${count}회` : '-'}
                      </StatValue>
                    </Td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </Table>
    </TableContainer>
  );
};

const TableContainer = styled.div`
  overflow-x: auto;

  @media (max-width: 640px) {
    max-width: 100vw;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
`;

const Th = styled.th<{ isFirst?: boolean; isRank?: boolean; clickable?: boolean }>`
  padding: 0.75rem 1rem;
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: #475569;
  background-color: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  border-right: 1px solid #e2e8f0;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: ${(props) => (props.isFirst || props.isRank ? 2 : 1)};
  min-width: 65px;
  cursor: ${(props) => (props.clickable ? 'pointer' : 'default')};
  user-select: none;

  ${(props) =>
    props.isRank &&
    `
    left: 0;
    min-width: ${RANK_COL_WIDTH};
    width: ${RANK_COL_WIDTH};
    text-align: center;
  `}

  ${(props) =>
    props.isFirst &&
    `
    left: ${RANK_COL_WIDTH};
    border-right: 2px solid #cbd5e1;
  `}

  &:last-child {
    border-right: none;
  }

  @media (max-width: 640px) {
    padding: 0.625rem 0.75rem;
    font-size: 0.7rem;
  }
`;

const Td = styled.td<{ isFirst?: boolean; isRank?: boolean; topThree?: boolean }>`
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  border-bottom: 1px solid #e2e8f0;
  border-right: 1px solid #e2e8f0;
  background-color: ${(props) => (props.topThree ? '#eff6ff' : 'white')};
  min-width: 65px;

  ${(props) =>
    props.isRank &&
    `
    position: sticky;
    left: 0;
    z-index: 1;
    min-width: ${RANK_COL_WIDTH};
    width: ${RANK_COL_WIDTH};
    text-align: center;
  `}

  ${(props) =>
    props.isFirst &&
    `
    position: sticky;
    left: ${RANK_COL_WIDTH};
    z-index: 1;
    border-right: 2px solid #cbd5e1;
  `}

  &:last-child {
    border-right: none;
  }

  @media (max-width: 640px) {
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
  }
`;

const PlayerName = styled.span`
  font-weight: 500;
`;

const StatValue = styled.span<{ isPositive?: boolean; isNeutral?: boolean }>`
  font-weight: 500;
  color: ${(props) => {
    if (props.isNeutral) return '#64748b';
    return props.isPositive ? '#059669' : '#dc2626';
  }};
`;

const EmptyText = styled.p`
  padding: 3rem 0;
  text-align: center;
  font-size: 1rem;
  color: #64748b;
`;

const PlaceholderText = styled.p`
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: #64748b;
`;

export default RecordsTable;
```

- [ ] **Step 2: 린트 확인**

Run: `cd /Users/onady/project/dngg/frontend && pnpm lint`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
cd /Users/onady/project/dngg
git add frontend/src/app/daily/components/RecordsTable.tsx
git commit -m "feat: daily 페이지 선수 기록 테이블 컴포넌트 추가 (순위·정렬 지원)"
```

---

### Task 7: 프론트 — page.tsx를 TanStack Query 기반으로 재구성

**Files:**
- Modify: `frontend/src/app/daily/page.tsx` (전면 재작성)

**Interfaces:**
- Consumes: Task 4~6의 컴포넌트와 타입, 백엔드 API 3종(Task 1~3), `useGroupStore().selectedGroup: number | null`, `useMounted()`, `NoGroupSelected`
- Produces: 완성된 daily 페이지. 쿼리 키: `['daily-dates', groupId]`, `['daily-games', groupId, date]`, `['daily-records', groupId, date]`, `['logitems', groupId]`

- [ ] **Step 1: page.tsx 전면 재작성**

`frontend/src/app/daily/page.tsx` 전체를 다음으로 교체:

```tsx
"use client";

import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/axios';
import { useGroupStore } from '@/app/stores/groupStore';
import NoGroupSelected from '@/app/components/NoGroupSelected';
import { useMounted } from '@/app/lib/useMounted';
import DateNavigator from './components/DateNavigator';
import GameSummaryCards from './components/GameSummaryCards';
import RecordsTable from './components/RecordsTable';
import SectionError from './components/SectionError';
import { GameSummary, LogItemDef, PlayerRecord } from './types';

const DailyPage = () => {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const { selectedGroup } = useGroupStore();
  const mounted = useMounted();

  const datesQuery = useQuery<string[]>({
    queryKey: ['daily-dates', selectedGroup],
    queryFn: async () =>
      (await api.get(`/log/daily/dates?groupId=${selectedGroup}`)).data,
    enabled: mounted && !!selectedGroup,
  });

  const dates = datesQuery.data ?? [];

  // 날짜 목록 로드 후(또는 그룹 변경으로 목록이 바뀐 후) 최신 날짜를 기본 선택
  useEffect(() => {
    if (dates.length > 0 && !dates.includes(selectedDate)) {
      setSelectedDate(dates[0]);
    }
  }, [dates, selectedDate]);

  const gamesQuery = useQuery<GameSummary[]>({
    queryKey: ['daily-games', selectedGroup, selectedDate],
    queryFn: async () =>
      (
        await api.get(
          `/log/daily/games?date=${selectedDate}&groupId=${selectedGroup}`,
        )
      ).data,
    enabled: mounted && !!selectedGroup && !!selectedDate,
  });

  const recordsQuery = useQuery<PlayerRecord[]>({
    queryKey: ['daily-records', selectedGroup, selectedDate],
    queryFn: async () =>
      (
        await api.get(
          `/log/daily?date=${selectedDate}&groupId=${selectedGroup}`,
        )
      ).data,
    enabled: mounted && !!selectedGroup && !!selectedDate,
  });

  const logitemsQuery = useQuery<LogItemDef[]>({
    queryKey: ['logitems', selectedGroup],
    queryFn: async () =>
      (await api.get(`/logitem?groupId=${selectedGroup}`)).data,
    enabled: mounted && !!selectedGroup,
  });

  if (!mounted) return null;

  if (!selectedGroup) {
    return <NoGroupSelected />;
  }

  if (datesQuery.isLoading) {
    return (
      <LoadingContainer>
        <LoadingSpinner />
      </LoadingContainer>
    );
  }

  if (datesQuery.isError) {
    return (
      <Container>
        <Title>일일 기록</Title>
        <SectionError
          message="날짜 목록을 불러오는데 실패했습니다."
          onRetry={() => datesQuery.refetch()}
        />
      </Container>
    );
  }

  if (dates.length === 0) {
    return (
      <Container>
        <Title>일일 기록</Title>
        <EmptyContainer>
          <EmptyText>기록된 게임이 없습니다.</EmptyText>
        </EmptyContainer>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <Title>일일 기록</Title>
        {selectedDate && (
          <DateNavigator
            dates={dates}
            selectedDate={selectedDate}
            onChange={setSelectedDate}
          />
        )}
      </Header>

      {gamesQuery.isError ? (
        <SectionError
          message="경기 요약을 불러오는데 실패했습니다."
          onRetry={() => gamesQuery.refetch()}
        />
      ) : (
        <GameSummaryCards
          games={gamesQuery.data ?? []}
          loading={gamesQuery.isLoading}
        />
      )}

      {recordsQuery.isError ? (
        <SectionError
          message="선수 기록을 불러오는데 실패했습니다."
          onRetry={() => recordsQuery.refetch()}
        />
      ) : (
        <RecordsTable
          records={recordsQuery.data ?? []}
          logItems={logitemsQuery.data ?? []}
          loading={recordsQuery.isLoading || logitemsQuery.isLoading}
        />
      )}
    </Container>
  );
};

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem;
  margin-top: calc(var(--header-height) + 4px);
`;

const Header = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  position: sticky;
  top: 0;
  z-index: 10;
  background: white;
  padding-top: 1rem;

  @media (min-width: 768px) {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding-top: 0;
  }
`;

const Title = styled.h1`
  font-size: 1.5rem;
  font-weight: 600;
`;

const EmptyContainer = styled.div`
  padding: 3rem 0;
  text-align: center;
`;

const EmptyText = styled.p`
  font-size: 1rem;
  color: #64748b;
`;

const LoadingContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 3rem 0;
`;

const LoadingSpinner = styled.div`
  width: 2.5rem;
  height: 2.5rem;
  border: 4px solid rgba(59, 130, 246, 0.1);
  border-left-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

export default DailyPage;
```

- [ ] **Step 2: 린트 + 빌드 확인**

Run: `cd /Users/onady/project/dngg/frontend && pnpm lint && pnpm build`
Expected: 린트 에러 없음, 빌드 성공 (`/daily` 라우트 포함)

- [ ] **Step 3: 커밋**

```bash
cd /Users/onady/project/dngg
git add frontend/src/app/daily/
git commit -m "feat: daily 페이지를 TanStack Query 기반 날짜 내비·게임 요약·순위 테이블 레이아웃으로 재구성"
```

---

### Task 8: 통합 검증 (수동 스모크)

**Files:**
- 없음 (검증만)

**Interfaces:**
- Consumes: Task 1~7 전체

- [ ] **Step 1: 전체 백엔드 테스트 + 린트 최종 확인**

Run: `cd /Users/onady/project/dngg/backend && pnpm test`
Expected: 전체 PASS

- [ ] **Step 2: 로컬 스택 기동**

```bash
cd /Users/onady/project/dngg && docker compose up -d db
cd backend && pnpm dev    # 터미널 1 (:3010)
cd frontend && pnpm dev   # 터미널 2 (:3011)
```

(백그라운드 실행 시 로그로 부팅 완료 확인. CLAUDE.md의 watch 다중 인스턴스 주의 — 기존 dev 프로세스가 떠 있으면 재사용.)

- [ ] **Step 3: API 스모크**

```bash
curl -s 'http://localhost:3010/log/daily/dates?groupId=1'
curl -s 'http://localhost:3010/log/daily?date=<위에서 나온 날짜>&groupId=1'
curl -s 'http://localhost:3010/log/daily/games?date=<위에서 나온 날짜>&groupId=1'
curl -s 'http://localhost:3010/log/daily?date=2026-07-18' # groupId 누락 → 400 확인
```

Expected: 앞 3개는 JSON 배열, 마지막은 400 (groupId 필수).
추가 확인: 로컬 DB에 그룹이 2개 이상 있으면 다른 groupId로 호출해 서로 다른 결과가 나오는지 확인 (누수 수정 검증).

- [ ] **Step 4: 브라우저 스모크 (모바일 뷰포트 우선)**

`http://localhost:3011/daily`에서 확인:

1. 최신 날짜가 기본 선택되고 ◀/▶로 이동, 양 끝에서 버튼 비활성화
2. 가운데 날짜 탭 → 네이티브 select 열림
3. 게임 요약 카드에 팀명/스코어 표시, 팀명 없는 게임은 "홈"/"어웨이"
4. 테이블: 순위 메달(1~3위) + 행 하이라이트, 가로 스크롤 시 #·선수 컬럼 sticky
5. 헤더 탭 정렬: 내림차순 → 오름차순 → 기본 순환
6. 그룹 전환 시 날짜 목록·기록 갱신, 그룹 미선택 시 NoGroupSelected

- [ ] **Step 5: 마무리**

superpowers:verification-before-completion 스킬을 사용해 증거를 확인한 뒤 결과를 보고한다. **푸시는 사용자 확인 후에만** (main 푸시 = 운영 배포, 프론트·백 동시 배포 필요).
