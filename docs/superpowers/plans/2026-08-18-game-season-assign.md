# 경기 시즌 배정 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/games`의 완료 경기 목록에서 그룹장이 경기를 골라 시즌에 배정하고, 시즌 미지정으로 되돌릴 수 있게 한다.

**Architecture:** 스키마 변경 없이 기존 `Game.seasonId`를 나중에 채우는 경로를 연다. 날짜 범위는 **조회 필터로만** 쓰고 이동은 화면에서 체크한 **명시적 id 목록**으로 한다 — 범위를 서버 이동 기준으로 쓰면 체크를 푼 경기까지 옮겨져 보이는 것과 동작이 어긋난다. 그룹 소유권 검증은 기존 `assertIdsInGroup`을 재사용하고, 하나라도 어긋나면 전부 거부해 부분 성공을 만들지 않는다.

**Tech Stack:** NestJS 11 + TypeORM + PostgreSQL 15 / Next.js 14 App Router + styled-components + Zustand

원본 설계: `docs/superpowers/specs/2026-08-18-game-season-assign-design.md`

## Global Constraints

- 패키지 매니저는 **pnpm**. 명령은 반드시 `backend/` 또는 `frontend/` 디렉토리 안에서 실행한다.
- **커밋 메시지의 제목·본문은 한글로 작성한다.** conventional 타입 접두어(`feat:`, `fix:`, `test:`)는 영문 그대로 쓴다.
- **`main`에 푸시하면 운영에 자동 배포된다.** 이 계획의 어떤 태스크도 푸시하지 않는다. 커밋만 한다.
- **스키마를 변경하지 않는다.** `Game.seasonId`는 이미 존재한다. 새 엔티티·새 컬럼·마이그레이션을 만들지 않는다.
- **FK 제약을 만들지 않는다.** 이 저장소는 운영 DB에서 FK를 의도적으로 제거한 상태다.
- 전역 `ValidationPipe`가 `whitelist: true` + `forbidNonWhitelisted: true`다. **DTO 클래스를 쓰는 엔드포인트는 필드를 선언하지 않으면 요청이 400으로 거부된다.** 원시 `@Query('name')` 파라미터는 ValidationPipe가 건너뛰므로 DTO가 불필요하지만, **대신 자동 검증도 없다.**
- **부분 성공을 만들지 않는다.** 검증이 하나라도 실패하면 아무것도 바꾸지 않는다.
- **백엔드 `pnpm lint`를 실행하지 마세요** — `eslint --fix`라 저장소 전체를 수정한다. 확인은 `npx eslint --no-fix <파일>`로 범위를 좁힌다.
- **프론트엔드 `pnpm lint` / `npx next lint`를 실행하지 마세요** — 이 저장소의 프론트 lint는 대화형 설정 프롬프트가 떠서 **터미널이 멈춘다**(사전 존재 문제). 프론트 검증은 `pnpm build`(타입체크 포함)로 한다.
- 프론트엔드에는 테스트 프레임워크가 없다. **새로 도입하지 않는다.**
- 백엔드 테스트는 실제 DB 없이 jest 목으로 작성한다 (이 저장소의 기존 `*.spec.ts` 패턴).

## File Structure

**백엔드 (신규)**

| 파일 | 책임 |
|---|---|
| `backend/src/common/date-range.ts` | `from`/`to` 형식·순서 검증 (DTO 없는 경로의 유일한 안전망) |

**백엔드 (수정)**

| 파일 | 변경 |
|---|---|
| `backend/src/repository/game.repository.ts` | `findByGroupId`에 `from`/`to` 조건, `updateSeason` 추가 |
| `backend/src/modules/game/game.service.ts` | `assignSeason` 추가, `getGames`가 `from`/`to`를 넘기고 응답에 `seasonId` 포함 |
| `backend/src/modules/game/game.request.dto.ts` | `PutGameSeasonRequestDto` 추가 |
| `backend/src/modules/game/game.controller.ts` | `PUT /game/season` 신설, `GET /game`에 `from`/`to` + 검증 |

**프론트엔드 (신규)**

| 파일 | 책임 |
|---|---|
| `frontend/src/lib/gameApi.ts` | 경기 시즌 배정·범위 조회 API 클라이언트 (`seasonApi.ts` 패턴) |
| `frontend/src/app/games/components/GameSeasonActionBar.tsx` | 선택 모드 하단 액션 바 |

**프론트엔드 (수정)**

| 파일 | 변경 |
|---|---|
| `frontend/src/types/game.ts` | `Game`에 `seasonId` 추가 |
| `frontend/src/app/games/page.tsx` | 시즌 배지, 선택 모드(진입·체크박스·날짜 필터·전체 선택) |

---

## Task 1: 경기 시즌 배정 — 서비스와 리포지토리

**Files:**
- Modify: `backend/src/repository/game.repository.ts`
- Modify: `backend/src/modules/game/game.service.ts`
- Test: `backend/src/modules/game/game.service.season-assign.spec.ts`

**Interfaces:**
- Consumes: `assertIdsInGroup(repository, ids, groupId, message)` (기존 `src/common/group-access.ts`)
- Produces:
  - `GameRepository.updateSeason(groupId: number, gameIds: number[], seasonId: number | null): Promise<number>` — 실제로 바뀐 행 수 반환
  - `GameService.assignSeason(dto: { groupId: number; gameIds: number[]; seasonId: number | null }): Promise<{ updated: number }>`

**배경:** 이 태스크가 이 기능의 핵심 안전 속성을 담당한다 — 다른 그룹의 경기나 시즌이 섞이면 **아무것도 바꾸지 않고 전부 거부**해야 한다. "27건 중 26건만 옮겨졌습니다"가 제일 나쁜 상태다.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/modules/game/game.service.season-assign.spec.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import { GameService } from './game.service';
import { Season } from 'src/entities/Season.entity';

const OWN_GROUP = 1;
const SEASON_ID = 7;
const GAME_IDS = [10, 11, 12];

// assertIdsInGroup은 repository.count({ where })만 쓴다.
// count가 요청한 id 개수와 같으면 통과, 다르면 ForbiddenException.
const createService = (options: {
  gameCount?: number; // 그룹 소유로 확인된 경기 수
  seasonCount?: number; // 그룹 소유로 확인된 시즌 수
  affected?: number;
} = {}) => {
  const gameRepository = {
    count: jest.fn().mockResolvedValue(options.gameCount ?? GAME_IDS.length),
    updateSeason: jest.fn().mockResolvedValue(options.affected ?? GAME_IDS.length),
  };
  const seasonRepository = {
    count: jest.fn().mockResolvedValue(options.seasonCount ?? 1),
  };
  const dataSource = {
    getRepository: jest.fn().mockImplementation((entity: any) =>
      entity === Season ? seasonRepository : gameRepository,
    ),
  };
  const service = new GameService(
    gameRepository as any,
    {} as any, // inGamePlayersRepository (미사용)
    {} as any, // logRepository (미사용)
    dataSource as any,
  );
  return { service, gameRepository, seasonRepository };
};

describe('GameService.assignSeason', () => {
  test('경기와 시즌이 모두 내 그룹이면 배정하고 바뀐 행 수를 돌려준다', async () => {
    const { service, gameRepository } = createService();

    const result = await service.assignSeason({
      groupId: OWN_GROUP,
      gameIds: GAME_IDS,
      seasonId: SEASON_ID,
    });

    expect(gameRepository.updateSeason).toHaveBeenCalledWith(
      OWN_GROUP,
      GAME_IDS,
      SEASON_ID,
    );
    expect(result).toEqual({ updated: 3 });
  });

  test('다른 그룹의 경기가 섞이면 거부하고 아무것도 바꾸지 않는다', async () => {
    // 3개를 요청했는데 내 그룹 소유는 2개뿐 → assertIdsInGroup이 던진다
    const { service, gameRepository } = createService({ gameCount: 2 });

    await expect(
      service.assignSeason({
        groupId: OWN_GROUP,
        gameIds: GAME_IDS,
        seasonId: SEASON_ID,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(gameRepository.updateSeason).not.toHaveBeenCalled();
  });

  test('다른 그룹의 시즌이면 거부하고 아무것도 바꾸지 않는다', async () => {
    const { service, gameRepository } = createService({ seasonCount: 0 });

    await expect(
      service.assignSeason({
        groupId: OWN_GROUP,
        gameIds: GAME_IDS,
        seasonId: SEASON_ID,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(gameRepository.updateSeason).not.toHaveBeenCalled();
  });

  test('seasonId가 null이면 시즌 조회 없이 시즌 미지정으로 되돌린다', async () => {
    const { service, gameRepository, seasonRepository } = createService();

    const result = await service.assignSeason({
      groupId: OWN_GROUP,
      gameIds: GAME_IDS,
      seasonId: null,
    });

    expect(seasonRepository.count).not.toHaveBeenCalled();
    expect(gameRepository.updateSeason).toHaveBeenCalledWith(
      OWN_GROUP,
      GAME_IDS,
      null,
    );
    expect(result).toEqual({ updated: 3 });
  });

  test('실제로 바뀐 행 수가 요청보다 적어도 그 수를 그대로 돌려준다', async () => {
    // 삭제된 경기가 섞여 UPDATE의 WHERE에서 빠진 경우
    const { service } = createService({ affected: 2 });

    const result = await service.assignSeason({
      groupId: OWN_GROUP,
      gameIds: GAME_IDS,
      seasonId: SEASON_ID,
    });

    expect(result).toEqual({ updated: 2 });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
cd backend && pnpm test -- src/modules/game/game.service.season-assign.spec.ts
```

Expected: FAIL — `service.assignSeason is not a function`

- [ ] **Step 3: `GameRepository.updateSeason` 구현**

`backend/src/repository/game.repository.ts`의 `updateGameQuarter` 아래에 추가한다:

```ts
  // 여러 경기의 시즌을 한 번에 바꾼다. seasonId가 null이면 시즌 미지정으로 되돌린다.
  // groupId를 WHERE에 다시 거는 것은 방어적 중복이다(서비스가 이미 소유권을 검증한다).
  // 삭제된 경기는 대상에서 제외한다.
  async updateSeason(
    groupId: number,
    gameIds: number[],
    seasonId: number | null,
  ): Promise<number> {
    if (gameIds.length === 0) return 0;
    const result = await this.gameRepository
      .createQueryBuilder()
      .update(Game)
      .set({ seasonId })
      .where('id IN (:...gameIds)', { gameIds })
      .andWhere('"groupId" = :groupId', { groupId: Number(groupId) })
      .andWhere("status <> 'DELETED'")
      .execute();
    return result.affected ?? 0;
  }
```

- [ ] **Step 4: `GameService.assignSeason` 구현**

`backend/src/modules/game/game.service.ts`의 import에 `Season`을 추가한다:

```ts
import { Season } from 'src/entities/Season.entity';
```

`assignSeason`을 클래스 안, `deleteGame` 아래에 추가한다:

```ts
  // 선택한 경기들의 시즌을 바꾼다. seasonId가 null이면 시즌 미지정으로 되돌린다.
  // 경기나 시즌이 하나라도 다른 그룹 소유면 전부 거부한다 — 부분 성공을 만들지 않는다.
  async assignSeason(dto: {
    groupId: number;
    gameIds: number[];
    seasonId: number | null;
  }): Promise<{ updated: number }> {
    await assertIdsInGroup(
      this.gameRepository,
      dto.gameIds,
      dto.groupId,
      '다른 그룹의 경기는 배정할 수 없습니다.',
    );

    // null은 "시즌 미지정으로 되돌리기"이므로 시즌 조회 자체가 필요 없다.
    if (dto.seasonId !== null && dto.seasonId !== undefined) {
      await assertIdsInGroup(
        this.dataSource.getRepository(Season),
        [dto.seasonId],
        dto.groupId,
        '다른 그룹의 시즌은 사용할 수 없습니다.',
      );
    }

    const updated = await this.gameRepository.updateSeason(
      dto.groupId,
      dto.gameIds,
      dto.seasonId ?? null,
    );
    return { updated };
  }
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd backend && pnpm test -- src/modules/game/game.service.season-assign.spec.ts
```

Expected: PASS (5 tests)

- [ ] **Step 6: 전체 스위트 확인**

```bash
cd backend && pnpm test
```

Expected: 전부 PASS. 기존 game 관련 spec의 `dataSource` 목에 `getRepository`가 없어 깨지면, 해당 스텁에 `getRepository: jest.fn().mockReturnValue({ count: jest.fn().mockResolvedValue(0) })`를 추가해 고친다. **기존 테스트의 단언은 바꾸지 않는다.**

- [ ] **Step 7: 커밋**

```bash
cd backend && git add src/repository/game.repository.ts src/modules/game/game.service.ts src/modules/game/game.service.season-assign.spec.ts
git commit -m "feat: 경기 시즌 배정 서비스 추가

경기나 시즌이 하나라도 다른 그룹 소유면 전부 거부한다. 27건 중
26건만 옮겨지는 부분 성공 상태를 만들지 않기 위해서다. seasonId가
null이면 시즌 조회 없이 시즌 미지정으로 되돌린다."
```

---

## Task 2: `PUT /game/season` 엔드포인트

**Files:**
- Modify: `backend/src/modules/game/game.request.dto.ts`
- Modify: `backend/src/modules/game/game.controller.ts`
- Test: `backend/src/modules/game/game.request.dto.spec.ts`
- Test: `backend/src/modules/game/game.controller.season.spec.ts`

**Interfaces:**
- Consumes: Task 1의 `GameService.assignSeason(dto): Promise<{ updated: number }>`
- Produces:
  - `class PutGameSeasonRequestDto { groupId: number; gameIds: number[]; seasonId: number | null }`
  - HTTP `PUT /game/season` (그룹장 전용)

**⚠️ 라우트 순서:** `@Put('season')`은 파라미터 라우트(`@Put(':id')` 등)보다 **먼저** 선언해야 한다. 현재 이 컨트롤러에 `@Put`이 없지만, 나중에 누가 `@Put(':id')`를 추가하면 `season`이 id로 해석된다. 지금 위에 두면 그 사고를 예방한다.

**⚠️ `seasonId: null`은 정상 입력값이다.** 전역 ValidationPipe가 `forbidNonWhitelisted`로 동작하므로, DTO 검증이 null을 막으면 "시즌 미지정으로 되돌리기"가 통째로 불가능해진다. 시즌제 1단계에서 같은 실수를 한 번 했으므로 **DTO 검증 층 테스트로 고정한다.**

- [ ] **Step 1: 실패하는 DTO 테스트 작성**

`backend/src/modules/game/game.request.dto.spec.ts`:

```ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PutGameSeasonRequestDto } from './game.request.dto';

const check = async (payload: object) => {
  const dto = plainToInstance(PutGameSeasonRequestDto, payload);
  return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
};

describe('PutGameSeasonRequestDto', () => {
  test('seasonId가 null이어도 통과한다 (시즌 미지정으로 되돌리기)', async () => {
    const errors = await check({ groupId: 1, gameIds: [10, 11], seasonId: null });
    expect(errors).toHaveLength(0);
  });

  test('seasonId가 숫자면 통과한다', async () => {
    const errors = await check({ groupId: 1, gameIds: [10], seasonId: 7 });
    expect(errors).toHaveLength(0);
  });

  test('seasonId가 숫자가 아니면 실패한다', async () => {
    const errors = await check({ groupId: 1, gameIds: [10], seasonId: 'abc' });
    expect(errors.some((e) => e.property === 'seasonId')).toBe(true);
  });

  test('gameIds가 비어 있으면 실패한다', async () => {
    const errors = await check({ groupId: 1, gameIds: [], seasonId: 7 });
    expect(errors.some((e) => e.property === 'gameIds')).toBe(true);
  });

  test('gameIds가 500개를 넘으면 실패한다', async () => {
    const tooMany = Array.from({ length: 501 }, (_, i) => i + 1);
    const errors = await check({ groupId: 1, gameIds: tooMany, seasonId: 7 });
    expect(errors.some((e) => e.property === 'gameIds')).toBe(true);
  });

  test('선언되지 않은 프로퍼티가 있으면 실패한다', async () => {
    const errors = await check({ groupId: 1, gameIds: [10], seasonId: 7, bogus: 1 });
    expect(errors.some((e) => e.property === 'bogus')).toBe(true);
  });
});
```

- [ ] **Step 2: 실패하는 컨트롤러 테스트 작성**

`backend/src/modules/game/game.controller.season.spec.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import { GameController } from './game.controller';

const OWN_GROUP = 1;
const OTHER_GROUP = 2;

const createController = () => {
  const service = {
    assignSeason: jest.fn().mockResolvedValue({ updated: 3 }),
  };
  const controller = new GameController(service as any);
  return { controller, service };
};

const req = (groupId: number) => ({ user: { groupId } });

describe('GameController.assignSeason', () => {
  test('다른 그룹 id로는 배정할 수 없다', async () => {
    const { controller, service } = createController();

    await expect(
      controller.assignSeason(req(OWN_GROUP), {
        groupId: OTHER_GROUP,
        gameIds: [10],
        seasonId: 7,
      } as any),
    ).rejects.toThrow(ForbiddenException);
    expect(service.assignSeason).not.toHaveBeenCalled();
  });

  test('내 그룹이면 서비스에 그대로 넘긴다', async () => {
    const { controller, service } = createController();

    const result = await controller.assignSeason(req(OWN_GROUP), {
      groupId: OWN_GROUP,
      gameIds: [10, 11, 12],
      seasonId: 7,
    } as any);

    expect(service.assignSeason).toHaveBeenCalledWith({
      groupId: OWN_GROUP,
      gameIds: [10, 11, 12],
      seasonId: 7,
    });
    expect(result).toEqual({ updated: 3 });
  });

  test('seasonId가 null이어도 그대로 넘긴다', async () => {
    const { controller, service } = createController();

    await controller.assignSeason(req(OWN_GROUP), {
      groupId: OWN_GROUP,
      gameIds: [10],
      seasonId: null,
    } as any);

    expect(service.assignSeason).toHaveBeenCalledWith({
      groupId: OWN_GROUP,
      gameIds: [10],
      seasonId: null,
    });
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

```bash
cd backend && pnpm test -- src/modules/game/game.request.dto.spec.ts src/modules/game/game.controller.season.spec.ts
```

Expected: FAIL — `PutGameSeasonRequestDto`가 없고 `controller.assignSeason`이 함수가 아님

- [ ] **Step 4: DTO 추가**

`backend/src/modules/game/game.request.dto.ts`의 import를 다음으로 교체한다:

```ts
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
```

파일 **끝에** 클래스를 추가한다:

```ts
export class PutGameSeasonRequestDto {
  @IsNotEmpty()
  @IsNumber()
  groupId: number;

  // 상한 없는 배열을 받는 엔드포인트를 열어두지 않는다.
  // 현재 최대 그룹이 45경기라 실질 제약은 아니다.
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  gameIds: number[];

  // null은 "시즌 미지정으로 되돌리기"를 뜻하는 정상 입력값이므로
  // null일 때는 숫자 검증을 건너뛴다.
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  seasonId: number | null;
}
```

- [ ] **Step 5: 컨트롤러 라우트 추가**

`backend/src/modules/game/game.controller.ts`의 `@nestjs/common` import에 `Put`을 추가하고, `game.request.dto`의 import에 `PutGameSeasonRequestDto`를 추가한다:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import {
  PostGameAndLogsRequestDto,
  PostGameRequestDto,
  PatchGameQuarterRequestDto,
  PutGameSeasonRequestDto,
} from './game.request.dto';
```

라우트를 **`@Get()` 바로 위**(클래스 안 첫 라우트)에 넣는다. 파라미터 라우트보다 먼저 선언해 `season`이 id로 해석되는 사고를 예방한다:

```ts
  // 파라미터 라우트(:id)보다 먼저 선언해야 'season'이 id로 해석되지 않는다.
  @Put('season')
  @UseGuards(AuthGuard('jwt'))
  async assignSeason(
    @Request() req,
    @Body(ValidationPipe) dto: PutGameSeasonRequestDto,
  ) {
    assertSameGroup(req.user.groupId, dto.groupId);
    return this.gameService.assignSeason({
      groupId: dto.groupId,
      gameIds: dto.gameIds,
      seasonId: dto.seasonId,
    });
  }
```

- [ ] **Step 6: 테스트·빌드 확인**

```bash
cd backend && pnpm test && pnpm build
```

Expected: 전부 PASS, 빌드 성공

- [ ] **Step 7: 커밋**

```bash
cd backend && git add src/modules/game/
git commit -m "feat: PUT /game/season 엔드포인트 추가

seasonId: null이 정상 입력값(시즌 미지정으로 되돌리기)이라는 것을
DTO 검증 층 테스트로 고정했다. 시즌제 1단계에서 같은 자리를 놓쳐
500이 났던 적이 있다. 'season'이 id로 해석되지 않도록 라우트를
파라미터 라우트보다 먼저 선언했다."
```

---

## Task 3: `GET /game` 확장 — 날짜 범위와 seasonId 응답

**Files:**
- Create: `backend/src/common/date-range.ts`
- Modify: `backend/src/repository/game.repository.ts`
- Modify: `backend/src/modules/game/game.service.ts`
- Modify: `backend/src/modules/game/game.controller.ts`
- Test: `backend/src/common/date-range.spec.ts`
- Test: `backend/src/repository/game.repository.range.spec.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `assertValidDateRange(from?: string, to?: string): void` — 형식·순서 위반 시 `BadRequestException`
  - `GameRepository.findByGroupId(groupId, options?: { page?, limit?, status?, from?: string, to?: string })`
  - `GameService.getGames` 응답의 각 경기에 `seasonId: number | null` 포함
  - HTTP `GET /game?groupId=&status=&from=&to=` (page/limit 생략 시 전부 반환)

**⚠️ 이 엔드포인트는 DTO 없이 원시 `@Query('name')` 파라미터를 쓴다.** ValidationPipe가 관여하지 않으므로 `forbidNonWhitelisted` 함정은 없지만, **자동 검증도 없다.** 검증을 빠뜨리면 잘못된 문자열이 그대로 SQL 파라미터로 내려가 Postgres 에러(500)가 난다 — 시즌제 1단계에서 `seasonId=abc`가 정확히 이 경로로 500을 냈다.

- [ ] **Step 1: 실패하는 날짜 검증 테스트 작성**

`backend/src/common/date-range.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { assertValidDateRange } from './date-range';

describe('assertValidDateRange', () => {
  test('둘 다 없으면 통과한다', () => {
    expect(() => assertValidDateRange(undefined, undefined)).not.toThrow();
  });

  test('올바른 범위는 통과한다', () => {
    expect(() => assertValidDateRange('2026-01-01', '2026-12-31')).not.toThrow();
  });

  test('같은 날짜는 통과한다', () => {
    expect(() => assertValidDateRange('2026-05-05', '2026-05-05')).not.toThrow();
  });

  test('한쪽만 있어도 통과한다', () => {
    expect(() => assertValidDateRange('2026-01-01', undefined)).not.toThrow();
    expect(() => assertValidDateRange(undefined, '2026-12-31')).not.toThrow();
  });

  test('형식이 틀리면 BadRequestException을 던진다', () => {
    expect(() => assertValidDateRange('2026-1-1', undefined)).toThrow(BadRequestException);
    expect(() => assertValidDateRange('abc', undefined)).toThrow(BadRequestException);
    expect(() => assertValidDateRange(undefined, '2026/12/31')).toThrow(BadRequestException);
  });

  test('from이 to보다 뒤면 BadRequestException을 던진다', () => {
    expect(() => assertValidDateRange('2026-12-31', '2026-01-01')).toThrow(
      BadRequestException,
    );
  });
});
```

- [ ] **Step 2: 실패하는 리포지토리 테스트 작성**

`backend/src/repository/game.repository.range.spec.ts`:

```ts
import { GameRepository } from './game.repository';

// 실제 DB 없이 쿼리 빌더 호출만 검증한다 (rankings.repository.spec.ts 패턴).
const createRepository = () => {
  const qb: any = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getMany: jest.fn().mockResolvedValue([]),
  };
  const inner = {
    target: {},
    manager: {},
    queryRunner: undefined,
    createQueryBuilder: jest.fn(() => qb),
  };
  const repository = new GameRepository(inner as any);
  return { repository, qb };
};

const rangeCalls = (qb: any) =>
  qb.andWhere.mock.calls.filter(
    (c: any[]) => typeof c[0] === 'string' && /game\."date"/.test(c[0]),
  );

describe('GameRepository.findByGroupId 날짜 범위', () => {
  test('from을 주면 시작 조건이 붙는다', async () => {
    const { repository, qb } = createRepository();

    await repository.findByGroupId(1, { from: '2026-01-01' });

    expect(qb.andWhere).toHaveBeenCalledWith('game."date" >= :from', {
      from: '2026-01-01',
    });
  });

  test('to를 주면 종료 조건이 붙는다', async () => {
    const { repository, qb } = createRepository();

    await repository.findByGroupId(1, { to: '2026-12-31' });

    expect(qb.andWhere).toHaveBeenCalledWith('game."date" <= :to', {
      to: '2026-12-31',
    });
  });

  test('범위를 안 주면 날짜 조건이 붙지 않는다', async () => {
    const { repository, qb } = createRepository();

    await repository.findByGroupId(1, { status: 'FINISHED' });

    expect(rangeCalls(qb)).toHaveLength(0);
  });

  test('page/limit이 없으면 페이징하지 않는다', async () => {
    const { repository, qb } = createRepository();

    await repository.findByGroupId(1, { from: '2026-01-01', to: '2026-12-31' });

    expect(qb.skip).not.toHaveBeenCalled();
    expect(qb.take).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

```bash
cd backend && pnpm test -- src/common/date-range.spec.ts src/repository/game.repository.range.spec.ts
```

Expected: FAIL — `date-range` 모듈이 없고 날짜 조건이 붙지 않음

- [ ] **Step 4: 날짜 검증 헬퍼 작성**

`backend/src/common/date-range.ts`:

```ts
import { BadRequestException } from '@nestjs/common';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// GET /game의 from/to는 DTO 없이 원시 쿼리 파라미터로 들어오므로
// 전역 ValidationPipe가 관여하지 않는다. 여기서 막지 않으면 잘못된 문자열이
// 그대로 SQL 파라미터로 내려가 Postgres 에러(500)가 된다.
// YYYY-MM-DD는 사전순 비교가 곧 날짜 비교라 문자열 그대로 대소를 판정할 수 있다.
export function assertValidDateRange(from?: string, to?: string): void {
  if (from !== undefined && !DATE_PATTERN.test(from)) {
    throw new BadRequestException('from은 YYYY-MM-DD 형식이어야 합니다.');
  }
  if (to !== undefined && !DATE_PATTERN.test(to)) {
    throw new BadRequestException('to는 YYYY-MM-DD 형식이어야 합니다.');
  }
  if (from !== undefined && to !== undefined && from > to) {
    throw new BadRequestException('from은 to보다 뒤일 수 없습니다.');
  }
}
```

- [ ] **Step 5: 리포지토리에 날짜 조건 추가**

`backend/src/repository/game.repository.ts`의 `findByGroupId`를 다음으로 교체한다:

```ts
  async findByGroupId(
    groupId: number,
    options?: {
      page?: number;
      limit?: number;
      status?: string;
      from?: string;
      to?: string;
    },
  ): Promise<Game[]> {
    const query = this.gameRepository
      .createQueryBuilder('game')
      .where('game."groupId" = :groupId', { groupId })
      .andWhere('game."status" != :deletedStatus', {
        deletedStatus: 'DELETED',
      });

    if (options?.status) {
      query.andWhere('game."status" = :status', { status: options.status });
    }

    // 날짜 범위는 양끝을 포함한다.
    if (options?.from) {
      query.andWhere('game."date" >= :from', { from: options.from });
    }
    if (options?.to) {
      query.andWhere('game."date" <= :to', { to: options.to });
    }

    query.orderBy('game."id"', 'DESC');

    if (options?.page !== undefined && options?.limit !== undefined) {
      query.skip((options.page - 1) * options.limit).take(options.limit + 1);
    }

    return query.getMany();
  }
```

- [ ] **Step 6: 서비스에 범위 전달과 seasonId 응답 추가**

`backend/src/modules/game/game.service.ts`의 `getGames` 시그니처를 넓히고 응답에 `seasonId`를 넣는다. 두 곳을 고친다.

시그니처:

```ts
  async getGames(
    groupId: number,
    options?: {
      page?: number;
      limit?: number;
      status?: string;
      from?: string;
      to?: string;
    },
  ) {
```

응답 객체 — `return {` 블록의 `date: game.date,` 아래에 한 줄 추가:

```ts
        // 목록에서 어느 경기가 어느 시즌인지 보여주려면 필요하다.
        seasonId: game.seasonId ?? null,
```

(`this.gameRepository.findByGroupId(groupId, options)` 호출은 그대로 두면 `options`가 통째로 넘어가므로 수정 불필요하다.)

- [ ] **Step 7: 컨트롤러에 from/to 추가**

`backend/src/modules/game/game.controller.ts`의 import에 검증 헬퍼를 추가한다:

```ts
import { assertValidDateRange } from 'src/common/date-range';
```

`@Get()` 라우트를 다음으로 교체한다:

```ts
  @Get()
  async getGameByGroupId(
    @Query('groupId') groupId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    // DTO가 없는 경로라 전역 ValidationPipe가 관여하지 않는다 — 여기서 막아야 한다.
    assertValidDateRange(from, to);
    return this.gameService.getGames(groupId, {
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
      status,
      from,
      to,
    });
  }
```

- [ ] **Step 8: 테스트·빌드 확인**

```bash
cd backend && pnpm test && pnpm build
```

Expected: 전부 PASS, 빌드 성공

- [ ] **Step 9: 커밋**

```bash
cd backend && git add src/common/date-range.ts src/common/date-range.spec.ts src/repository/game.repository.ts src/repository/game.repository.range.spec.ts src/modules/game/game.service.ts src/modules/game/game.controller.ts
git commit -m "feat: GET /game에 날짜 범위 필터와 seasonId 응답 추가

from/to는 DTO 없는 원시 쿼리 파라미터라 전역 ValidationPipe가
관여하지 않는다. 형식·순서 검증을 컨트롤러에서 직접 하지 않으면
잘못된 문자열이 SQL로 내려가 500이 난다."
```

---

## Task 4: 프론트 API 클라이언트와 타입

**Files:**
- Create: `frontend/src/lib/gameApi.ts`
- Modify: `frontend/src/types/game.ts`

**Interfaces:**
- Consumes: Task 2·3의 `PUT /game/season`, `GET /game?...&from=&to=`
- Produces:
  - `assignGameSeason(groupId: number, gameIds: number[], seasonId: number | null): Promise<{ updated: number }>`
  - `fetchFinishedGamesInRange(groupId: number, from: string, to: string): Promise<Game[]>`
  - `Game` 타입에 `seasonId?: number | null`

- [ ] **Step 1: API 클라이언트 작성**

`frontend/src/lib/gameApi.ts` (`seasonApi.ts`와 같은 위치·패턴):

```ts
import { api } from "@/lib/axios";
import type { Game } from "@/types/game";

export interface AssignSeasonResult {
  updated: number;
}

// seasonId가 null이면 시즌 미지정으로 되돌린다.
export const assignGameSeason = async (
  groupId: number,
  gameIds: number[],
  seasonId: number | null
): Promise<AssignSeasonResult> => {
  const response = await api.put("/game/season", { groupId, gameIds, seasonId });
  return response.data;
};

// 날짜 범위 안의 완료 경기를 페이징 없이 전부 가져온다(선택 모드 전용).
export const fetchFinishedGamesInRange = async (
  groupId: number,
  from: string,
  to: string
): Promise<Game[]> => {
  const response = await api.get("/game", {
    params: { groupId, status: "FINISHED", from, to },
  });
  const data = response.data;
  return Array.isArray(data) ? data : (data.games ?? []);
};
```

**주의:** `@/lib/axios`를 쓴다. `src/app/lib/axios.ts`는 아무 곳에서도 import하지 않는 레거시 중복 파일이다.

- [ ] **Step 2: 타입 확장**

`frontend/src/types/game.ts`의 `Game` 인터페이스에서 `currentQuarter` 위에 한 줄 추가한다:

```ts
  seasonId?: number | null; // 시즌 미지정이면 null, 구버전 백엔드면 undefined
```

- [ ] **Step 3: 빌드 확인**

```bash
cd frontend && pnpm build && git status --short
```

Expected: 빌드 성공. `git status`에 이 태스크의 두 파일 외 변경이 없어야 한다.

- [ ] **Step 4: 커밋**

```bash
cd frontend && git add src/lib/gameApi.ts src/types/game.ts
git commit -m "feat: 경기 시즌 배정 API 클라이언트 추가

범위 조회는 페이징 없이 전부 받는다 — 선택 모드에서 '전체 선택'이
실제로 범위 전체를 고르게 하기 위해서다."
```

---

## Task 5: 선택 모드 하단 액션 바 컴포넌트

**Files:**
- Create: `frontend/src/app/games/components/GameSeasonActionBar.tsx`

**Interfaces:**
- Consumes: `Season` 타입 (`@/lib/seasonApi`의 `{ id: number; name: string; createdAt: string }`)
- Produces:
  - `<GameSeasonActionBar count={number} seasons={Season[]} onAssign={(seasonId: number | null) => void} onCancel={() => void} busy={boolean} />`

- [ ] **Step 1: 컴포넌트 작성**

`frontend/src/app/games/components/GameSeasonActionBar.tsx`
(`frontend/src/app/teams/components/SelectionActionBar.tsx`의 고정 바 패턴을 따른다):

```tsx
"use client";

import React, { useState } from "react";
import styled from "styled-components";
import type { Season } from "@/lib/seasonApi";

const Bar = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  /* InstallPrompt 배너(z-index 1000)보다 위 — 배정 작업이 진행 중일 때 우선 */
  z-index: 1100;
  background: white;
  border-top: 1px solid var(--border-color);
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.08);
  padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
`;

const CountBadge = styled.span`
  flex-shrink: 0;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--primary-color);
  white-space: nowrap;
`;

const Select = styled.select`
  flex: 1;
  min-width: 8rem;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  background: white;
`;

const AssignButton = styled.button`
  flex-shrink: 0;
  padding: 0.5rem 0.875rem;
  border-radius: 0.375rem;
  background-color: var(--primary-color);
  color: white;
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const CancelButton = styled.button`
  flex-shrink: 0;
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  background-color: #f3f4f6;
  color: #6b7280;
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
`;

// 시즌 미지정으로 되돌리기를 나타내는 <option> 값.
// 숫자 id와 섞이지 않는 문자열이어야 한다.
const NONE_VALUE = "none";

interface Props {
  count: number;
  seasons: Season[];
  busy: boolean;
  onAssign: (seasonId: number | null) => void;
  onCancel: () => void;
}

export default function GameSeasonActionBar({
  count,
  seasons,
  busy,
  onAssign,
  onCancel,
}: Props) {
  const [value, setValue] = useState<string>(
    seasons.length > 0 ? String(seasons[0].id) : NONE_VALUE
  );

  return (
    <Bar role="toolbar" aria-label="선택한 경기 시즌 배정">
      <CountBadge>{count}건 선택됨</CountBadge>
      <Select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        aria-label="배정할 시즌"
      >
        {seasons.map((season) => (
          <option key={season.id} value={season.id}>
            {season.name}
          </option>
        ))}
        <option value={NONE_VALUE}>시즌 미지정으로</option>
      </Select>
      <AssignButton
        onClick={() => onAssign(value === NONE_VALUE ? null : Number(value))}
        disabled={busy || count === 0}
      >
        배정
      </AssignButton>
      <CancelButton onClick={onCancel} disabled={busy}>
        취소
      </CancelButton>
    </Bar>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd frontend && pnpm build && git status --short
```

Expected: 빌드 성공, 이 태스크의 파일 1개만 변경

- [ ] **Step 3: 커밋**

```bash
cd frontend && git add src/app/games/components/GameSeasonActionBar.tsx
git commit -m "feat: 경기 시즌 배정 하단 액션 바 추가

드롭다운에 '시즌 미지정으로'를 넣어 잘못 배정한 것을 되돌릴 수 있게
했다. 되돌릴 수 있는 조작이라 확인 절차를 무겁게 걸지 않아도 된다."
```

---

## Task 6: 경기 카드에 시즌 배지

**Files:**
- Modify: `frontend/src/app/games/page.tsx`

**Interfaces:**
- Consumes: Task 3의 `GET /game` 응답 `seasonId`, Task 4의 `Game.seasonId` 타입
- Produces: 완료 경기 카드에 시즌명 배지 (선택 모드와 무관하게 항상 표시)

**배경:** 배지가 없으면 배정 결과를 확인할 방법이 없다. 선택 모드보다 먼저 넣어 두면 다음 태스크에서 배정이 실제로 반영됐는지 눈으로 볼 수 있다.

- [ ] **Step 1: 시즌 목록 로드 추가**

`frontend/src/app/games/page.tsx`의 import에 추가한다:

```tsx
import { fetchSeasons, Season } from "@/lib/seasonApi";
```

상태를 추가한다 (`const [finishedGames, ...]` 근처):

```tsx
  const [seasons, setSeasons] = useState<Season[]>([]);
```

시즌 목록을 불러오는 effect를 추가한다:

```tsx
  // 경기 카드의 시즌 배지와 선택 모드 드롭다운에 쓴다.
  useEffect(() => {
    if (!selectedGroup) {
      setSeasons([]);
      return;
    }
    fetchSeasons(selectedGroup)
      .then((data) => setSeasons(data.seasons))
      .catch((e) => {
        // 시즌 조회 실패는 배지만 사라질 뿐 경기 목록에는 영향이 없다.
        console.error("시즌 목록을 불러오지 못했습니다:", e);
        setSeasons([]);
      });
  }, [selectedGroup]);
```

- [ ] **Step 2: 배지 스타일과 렌더 추가**

`frontend/src/app/games/page.tsx`의 styled 컴포넌트 정의부(`const GameCard = styled.div` 근처)에 추가한다:

```tsx
const SeasonBadge = styled.span`
  display: inline-block;
  margin-left: 0.5rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 0.6875rem;
  font-weight: 600;
  vertical-align: middle;
`;
```

시즌 id로 이름을 찾는 헬퍼를 컴포넌트 안에 추가한다:

```tsx
  const seasonNameOf = (seasonId?: number | null) =>
    seasonId == null ? null : (seasons.find((s) => s.id === seasonId)?.name ?? null);
```

완료 경기 카드의 `<GameDate>` 줄 아래에 배지를 넣는다. 기존 코드는 다음과 같다:

```tsx
                <GameInfo>
                  <GameName>{`${game.homeTeamName} vs ${game.awayTeamName}`}</GameName>
                  <GameDate>{new Date(game.date).toLocaleDateString("ko-KR")}</GameDate>
                </GameInfo>
```

이것을 다음으로 교체한다:

```tsx
                <GameInfo>
                  <GameName>
                    {`${game.homeTeamName} vs ${game.awayTeamName}`}
                    {seasonNameOf(game.seasonId) && (
                      <SeasonBadge>{seasonNameOf(game.seasonId)}</SeasonBadge>
                    )}
                  </GameName>
                  <GameDate>{new Date(game.date).toLocaleDateString("ko-KR")}</GameDate>
                </GameInfo>
```

- [ ] **Step 3: 빌드 확인**

```bash
cd frontend && pnpm build && git status --short
```

Expected: 빌드 성공, `games/page.tsx`만 변경

- [ ] **Step 4: 커밋**

```bash
cd frontend && git add src/app/games/page.tsx
git commit -m "feat: 완료 경기 카드에 시즌 배지 표시

배지가 없으면 배정 결과를 확인할 방법이 없다. 시즌 조회가 실패해도
배지만 사라지고 경기 목록은 그대로 보인다."
```

---

## Task 7: 선택 모드 — 진입·체크박스·날짜 필터·전체 선택·배정

**Files:**
- Modify: `frontend/src/app/games/page.tsx`

**Interfaces:**
- Consumes: Task 4의 `assignGameSeason`·`fetchFinishedGamesInRange`, Task 5의 `<GameSeasonActionBar>`, Task 6의 `seasons` 상태와 `seasonNameOf`
- Produces: 없음 (최종 화면)

**이 태스크의 핵심은 "전체 선택"의 의미를 오해 없이 전달하는 것이다.** 완료 경기가 무한 스크롤이라, 45건 중 20건만 로드된 상태에서 "전체 선택"을 누르면 사용자는 45건을 골랐다고 믿는데 실제로는 20건이다. **개수 라벨과 `hasMore` 안내 두 가지가 이 화면에서 가장 중요하다.**

- [ ] **Step 1: import와 상태 추가**

`frontend/src/app/games/page.tsx`의 import에 추가한다:

```tsx
import GameSeasonActionBar from "./components/GameSeasonActionBar";
import { assignGameSeason, fetchFinishedGamesInRange } from "@/lib/gameApi";
```

상태를 추가한다:

```tsx
  const [selectMode, setSelectMode] = useState(false);
  const [selectedGameIds, setSelectedGameIds] = useState<Set<number>>(new Set());
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangeApplied, setRangeApplied] = useState(false);
  const [assigning, setAssigning] = useState(false);
```

- [ ] **Step 2: 선택 모드 진입·해제와 토글 핸들러 추가**

```tsx
  const enterSelectMode = () => {
    setSelectMode(true);
    setSelectedGameIds(new Set());
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedGameIds(new Set());
    setRangeFrom("");
    setRangeTo("");
    // 범위 조회로 목록을 갈아끼웠으면 원래 페이징 목록으로 되돌린다.
    if (rangeApplied) {
      setRangeApplied(false);
      loadFinishedInitial();
    }
  };

  const toggleGame = (gameId: number) => {
    setSelectedGameIds((prev) => {
      const next = new Set(prev);
      if (next.has(gameId)) next.delete(gameId);
      else next.add(gameId);
      return next;
    });
  };

  // '전체'는 항상 "지금 화면에 로드된 경기 전체"를 뜻한다.
  const allLoadedSelected =
    finishedGames.length > 0 && selectedGameIds.size === finishedGames.length;

  const toggleSelectAll = () => {
    setSelectedGameIds(
      allLoadedSelected ? new Set() : new Set(finishedGames.map((g) => g.id))
    );
  };
```

- [ ] **Step 3: 날짜 범위 적용·해제 핸들러 추가**

```tsx
  const applyRange = async () => {
    if (!selectedGroup) return;
    if (!rangeFrom || !rangeTo) {
      showToast("시작일과 종료일을 모두 입력해주세요.", "error");
      return;
    }
    if (rangeFrom > rangeTo) {
      showToast("시작일이 종료일보다 뒤일 수 없습니다.", "error");
      return;
    }
    try {
      const games = await fetchFinishedGamesInRange(selectedGroup, rangeFrom, rangeTo);
      setFinishedGames(games);
      setHasMoreFinished(false); // 범위 조회는 페이징 없이 전부 받는다
      setRangeApplied(true);
      setSelectedGameIds(new Set());
    } catch (error) {
      console.error("범위 조회에 실패했습니다:", error);
      showToast("해당 기간의 경기를 불러오지 못했습니다.", "error");
    }
  };

  const clearRange = () => {
    setRangeFrom("");
    setRangeTo("");
    setRangeApplied(false);
    setSelectedGameIds(new Set());
    loadFinishedInitial();
  };
```

- [ ] **Step 4: 배정 핸들러 추가**

```tsx
  const handleAssignSeason = async (seasonId: number | null) => {
    if (!selectedGroup || selectedGameIds.size === 0) return;

    const seasonName =
      seasonId === null
        ? "시즌 미지정"
        : (seasons.find((s) => s.id === seasonId)?.name ?? "선택한 시즌");
    const ok = await confirm({
      title: "시즌을 배정할까요?",
      message: `완료 경기 ${selectedGameIds.size}건을 '${seasonName}'(으)로 옮깁니다.`,
      confirmText: "배정",
    });
    if (!ok) return;

    setAssigning(true);
    try {
      const { updated } = await assignGameSeason(
        selectedGroup,
        Array.from(selectedGameIds),
        seasonId
      );
      showToast(`${updated}건을 '${seasonName}'(으)로 배정했습니다.`, "success");
      setSelectMode(false);
      setSelectedGameIds(new Set());
      // 배지를 갱신하려면 목록을 다시 읽어야 한다.
      if (rangeApplied && rangeFrom && rangeTo) {
        const games = await fetchFinishedGamesInRange(selectedGroup, rangeFrom, rangeTo);
        setFinishedGames(games);
      } else {
        loadFinishedInitial();
      }
    } catch (error: any) {
      showToast(
        error?.response?.data?.message ?? "시즌 배정에 실패했습니다.",
        "error"
      );
    } finally {
      setAssigning(false);
    }
  };
```

- [ ] **Step 5: 선택 모드 UI 스타일 추가**

styled 컴포넌트 정의부에 추가한다:

```tsx
const SelectToolbar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  background: #f9fafb;
`;

const RangeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const DateInput = styled.input`
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  font-size: 0.8125rem;
`;

const SmallButton = styled.button`
  padding: 0.375rem 0.625rem;
  border-radius: 0.375rem;
  background: #e5e7eb;
  color: #374151;
  font-size: 0.8125rem;
  white-space: nowrap;
`;

const SelectAllRow = styled.label`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  cursor: pointer;
`;

const MoreHint = styled.p`
  margin: 0;
  font-size: 0.75rem;
  color: #b45309;
`;

const SelectCheckbox = styled.input`
  margin-right: 0.5rem;
  width: 1.125rem;
  height: 1.125rem;
`;
```

- [ ] **Step 6: 완료 경기 섹션 헤더에 진입 버튼 추가**

`<SectionTitle>최근 게임 기록</SectionTitle>`을 다음으로 교체한다:

```tsx
          <SectionTitle>
            최근 게임 기록
            {canManage && seasons.length > 0 && !selectMode && (
              <SmallButton style={{ marginLeft: "0.75rem" }} onClick={enterSelectMode}>
                시즌 배정
              </SmallButton>
            )}
          </SectionTitle>
```

**시즌이 0개면 버튼을 숨긴다** — 드롭다운에 "시즌 미지정"밖에 없어 할 수 있는 게 없다. `SeasonSelector`가 시즌 0개일 때 숨기는 것과 같은 원칙이다.

- [ ] **Step 7: 선택 모드 툴바 렌더**

`<SectionTitle>` 아래, `<GameList>` 위에 넣는다:

```tsx
          {selectMode && (
            <SelectToolbar>
              <RangeRow>
                <DateInput
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  aria-label="시작일"
                />
                <span>~</span>
                <DateInput
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  aria-label="종료일"
                />
                <SmallButton onClick={applyRange}>기간 적용</SmallButton>
                {rangeApplied && <SmallButton onClick={clearRange}>기간 해제</SmallButton>}
              </RangeRow>

              <SelectAllRow>
                <input
                  type="checkbox"
                  checked={allLoadedSelected}
                  onChange={toggleSelectAll}
                />
                전체 선택 ({finishedGames.length}건)
              </SelectAllRow>

              {!rangeApplied && hasMoreFinished && (
                <MoreHint>
                  아래로 더 있습니다 — 날짜 범위를 지정하면 한 번에 고를 수 있습니다.
                </MoreHint>
              )}
            </SelectToolbar>
          )}
```

`전체 선택 ({finishedGames.length}건)`의 숫자는 **지금 로드된 경기 수**다. 범위를 적용했으면 범위 전체이고, 필터 없이 스크롤 중이면 그때까지 로드된 수다. `hasMore` 안내가 그 차이를 알려준다.

- [ ] **Step 8: 경기 카드에 체크박스 연결**

완료 경기의 `<GameCard key={game.id}>`를 다음으로 교체한다:

```tsx
              <GameCard
                key={game.id}
                onClick={selectMode ? () => toggleGame(game.id) : undefined}
                style={
                  selectMode && selectedGameIds.has(game.id)
                    ? { outline: "2px solid var(--primary-color)" }
                    : undefined
                }
              >
```

그리고 `<GameInfo>` 바로 위에 체크박스를 넣는다:

```tsx
                {selectMode && (
                  <SelectCheckbox
                    type="checkbox"
                    checked={selectedGameIds.has(game.id)}
                    onChange={() => toggleGame(game.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="이 경기 선택"
                  />
                )}
```

**선택 모드에서는 기존 액션 버튼(다시 진행하기·삭제)을 숨긴다.** `{canManage && (` 를 `{canManage && !selectMode && (` 로 바꾼다 — 선택 중에 실수로 삭제를 누르는 것을 막는다.

- [ ] **Step 9: 액션 바 렌더**

컴포넌트 `return`의 맨 끝(최상위 닫는 태그 직전)에 넣는다:

```tsx
      {selectMode && (
        <GameSeasonActionBar
          count={selectedGameIds.size}
          seasons={seasons}
          busy={assigning}
          onAssign={handleAssignSeason}
          onCancel={exitSelectMode}
        />
      )}
```

- [ ] **Step 10: 빌드 확인**

```bash
cd frontend && pnpm build && git status --short
```

Expected: 빌드 성공, `games/page.tsx`만 변경

- [ ] **Step 11: 커밋**

```bash
cd frontend && git add src/app/games/page.tsx
git commit -m "feat: 경기 목록에 시즌 배정 선택 모드 추가

'전체 선택'에 로드된 경기 수를 함께 적고, 더 불러올 게 남았으면
안내를 띄운다. 45건 중 20건만 로드된 상태에서 전체 선택을 누르고
45건을 골랐다고 믿는 오해를 막기 위해서다.

선택 모드에서는 다시 진행하기·삭제 버튼을 숨겨 실수를 막는다."
```

---

## Task 8: 통합 검증 (수동 스모크 포함)

**Files:** 없음 (검증 전용)

**⚠️ 이 태스크의 수동 스모크를 건너뛰지 않는다.** 시즌제 1단계에서 브라우저 확인을 건너뛴 결과가 "시즌을 지정하면 랭킹이 빈다"는 운영 사고였다. 이 화면은 특히 "전체 선택"의 의미가 오해를 부르기 쉬워 눌러봐야 잡힌다.

- [ ] **Step 1: 백엔드 전체 테스트와 빌드**

```bash
cd backend && pnpm test && pnpm build
```

Expected: 전부 PASS, 빌드 성공

- [ ] **Step 2: 프론트 빌드**

```bash
cd frontend && pnpm build
```

Expected: 성공

- [ ] **Step 3: 로컬 스택 기동**

```bash
cd /Users/onady/project/dngg && docker compose up -d db
# 터미널 2개로:
cd backend  && pnpm dev    # :3010
cd frontend && pnpm dev    # :3011
```

**주의:** 포트가 이미 점유돼 있으면 `lsof -ti tcp:3010 | xargs kill -9`로 정리한다. `pkill -f "nest start"`는 자식 프로세스를 놓쳐 구버전 서버가 계속 응답한다.

- [ ] **Step 4: API 레벨 확인**

```bash
# 날짜 범위 필터
curl -s "http://localhost:3010/game?groupId=1&status=FINISHED&from=2026-01-01&to=2026-12-31" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('건수:',len(d['games']),'| seasonId 포함:', 'seasonId' in (d['games'][0] if d['games'] else {}))"

# 잘못된 형식 → 400
curl -s -o /dev/null -w "형식 오류: %{http_code} (400이어야 정상)\n" \
  "http://localhost:3010/game?groupId=1&from=abc"

# 역순 → 400
curl -s -o /dev/null -w "역순: %{http_code} (400이어야 정상)\n" \
  "http://localhost:3010/game?groupId=1&from=2026-12-31&to=2026-01-01"

# 무인증 배정 → 401
curl -s -o /dev/null -w "무인증 배정: %{http_code} (401이어야 정상)\n" \
  -X PUT http://localhost:3010/game/season -H 'Content-Type: application/json' \
  -d '{"groupId":1,"gameIds":[1],"seasonId":null}'
```

- [ ] **Step 5: 브라우저 수동 확인 (필수)**

`http://localhost:3011/games`에서 그룹장 계정으로 로그인한 뒤 확인한다:

| 확인 항목 | 기대 |
|---|---|
| 시즌이 0개인 그룹 | "시즌 배정" 버튼이 **안 보인다** |
| 시즌을 만든 뒤 | "시즌 배정" 버튼이 보인다 |
| 선택 모드 진입 | 체크박스와 날짜 필터가 나타나고, 다시 진행하기·삭제 버튼이 사라진다 |
| 전체 선택 라벨 | 지금 로드된 경기 수와 **정확히 일치**한다 |
| 더 불러올 게 남았을 때 | "아래로 더 있습니다" 안내가 보인다 |
| 기간 적용 | 범위 내 경기만 나오고 안내가 사라진다(전부 로드됨) |
| 몇 건 선택 후 배정 | 확인 다이얼로그 → 성공 토스트 → 카드에 시즌 배지가 붙는다 |
| "시즌 미지정으로" 배정 | 배지가 사라진다 |
| 취소 | 선택 모드가 닫히고 원래 목록으로 돌아온다 |

- [ ] **Step 6: 회귀 확인**

시즌 배정과 무관한 기존 동작이 그대로인지 본다:

- `/games` 진행 중 경기 생성·종료·삭제
- 완료 경기 무한 스크롤(선택 모드 아닐 때)
- `/rankings`, `/player/:id` — 배정한 경기가 해당 시즌 필터에 실제로 잡히는지

- [ ] **Step 7: 배포 노트 확인**

이 계획은 커밋만 하고 푸시하지 않는다. 배포 시:

- **스키마 변경이 없다** — `synchronize` 리스크 없음
- 신규 엔드포인트라 **프론트가 먼저 나가면 404**다. 백엔드·프론트가 한 브랜치 한 머지로 나가면 `deploy.yml`의 deploy 잡이 두 잡을 함께 기다리므로 안전하다
- 배포 후 `/games`를 직접 열어 스모크한다 — CI 헬스체크는 `/group/all`과 프론트 루트만 본다

---

## Self-Review 결과

**Spec 커버리지**

| 설계 절 | 구현 태스크 |
|---|---|
| 1.1 `PUT /game/season` + 검증 3종 | Task 1(서비스 검증), Task 2(라우트·DTO) |
| 1.2 DTO (`ArrayMaxSize(500)`, `seasonId: null`) | Task 2 |
| 1.3 `GET /game`에 `from`/`to` + 형식·순서 검증 | Task 3 |
| 1.4 응답에 `seasonId` | Task 3 Step 6 |
| 2.1 진입 버튼(그룹장 + 시즌 1개 이상) | Task 7 Step 6 |
| 2.2 날짜 필터 / 전체 선택(개수) / `hasMore` 안내 | Task 7 Step 3·7 |
| 2.2 체크박스·시즌 배지 | Task 6(배지), Task 7 Step 8(체크박스) |
| 2.2 하단 액션 바(시즌 미지정 포함) | Task 5 |
| 2.3 진행 중 경기 제외 | Task 7 — 선택 모드 UI를 완료 경기 섹션에만 넣는다 |
| 3 엣지 케이스 | Task 1(그룹 격리), Task 2(빈 배열·상한), Task 3(날짜 오류) |
| 4 테스트 | Task 1·2·3 |
| 4 수동 확인 | Task 8 Step 5 |
| 5 배포 | Task 8 Step 7 |
| 6 운영 순서 | 설계 문서에 있음 — 코드 변경 없음 |

**설계와 달라진 점**: 없다. 설계 2.2의 "카드를 눌러도 선택된다"는 Task 7 Step 8의 `onClick={selectMode ? ... : undefined}`로 구현하되, 체크박스 자체의 클릭은 `stopPropagation`으로 이중 토글을 막았다 — 설계에 없던 세부지만 그대로 두면 클릭이 두 번 처리된다.

**타입 일관성 확인**: `assignGameSeason(groupId, gameIds, seasonId)`(Task 4) ↔ `PUT /game/season {groupId, gameIds, seasonId}`(Task 2) ↔ `GameService.assignSeason({groupId, gameIds, seasonId})`(Task 1) — 이름과 순서가 일치한다. `GameSeasonActionBar`의 `onAssign(seasonId: number | null)`(Task 5) ↔ `handleAssignSeason(seasonId: number | null)`(Task 7) 일치.
