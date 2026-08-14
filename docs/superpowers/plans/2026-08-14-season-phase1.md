# 시즌제 1단계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 그룹장이 시즌을 만들고 "현재 시즌"을 지정하면, 이후 생성되는 경기가 그 시즌에 귀속되고 개인 기록·능력치·팀 기여도를 시즌별로 볼 수 있게 한다.

**Architecture:** `Season` 엔티티를 새로 만들고 `Group.currentSeasonId`(현재 시즌 단일 진실) + `Game.seasonId`(생성 시점 스냅샷)로 귀속을 표현한다. 기존 경기는 `seasonId = null`로 남아 '전체'에서만 보인다. 랭킹 집계는 브라우저에서 서버로 옮기면서 순수 계산을 `rankings.util.ts`로 분리해(`ability.util.ts` 패턴) 단위 테스트한다.

**Tech Stack:** NestJS 11 + TypeORM(`synchronize: true`) + PostgreSQL 15 / Next.js 14 App Router + styled-components + Zustand

원본 설계: `docs/superpowers/specs/2026-08-14-season-design.md`

## Global Constraints

- 패키지 매니저는 **pnpm**. 명령은 반드시 `backend/` 또는 `frontend/` 디렉토리 안에서 실행한다.
- **커밋 메시지의 제목·본문은 한글로 작성한다.** conventional commit 타입 접두어(`feat:`, `fix:`, `test:`, `refactor:`)는 영문 그대로 쓴다.
- **`main`에 푸시하면 운영에 자동 배포된다.** 이 계획의 어떤 태스크도 푸시하지 않는다. 커밋만 한다.
- 전역 `ValidationPipe`가 `whitelist: true` + `forbidNonWhitelisted: true`다. **DTO 클래스를 쓰는 엔드포인트는 `seasonId` 필드를 DTO에 선언하지 않으면 요청이 400으로 거부된다.** (`@Query('seasonId') seasonId?: string`처럼 원시 타입 파라미터는 ValidationPipe가 건너뛰므로 DTO 불필요.)
- **FK 제약을 만들지 않는다.** 새 관계는 전부 `createForeignKeyConstraints: false`. 운영 DB에서 FK를 의도적으로 제거한 상태다.
- `Log.player` / `InGamePlayer.player`는 `null`일 수 있다. 집계 쿼리는 `INNER JOIN`으로 삭제된 선수를 제외한다.
- **`seasonId` 규약: 생략 = 전체(시즌 미지정 경기 포함), `seasonId=<숫자>` = 그 시즌만.** 전 API 동일.
- 백엔드 테스트는 실제 DB 없이 jest 목으로 작성한다 (이 저장소의 기존 `*.spec.ts` 패턴).
- 프론트엔드에는 테스트 프레임워크가 없다. 프론트 태스크의 검증은 `pnpm build` + `pnpm lint` + 명시된 수동 스모크로 한다. **테스트 프레임워크를 새로 도입하지 않는다.**
- `pnpm lint`는 `eslint --fix`라 **저장소 전체를 수정한다.** 린트 후 `git status`로 의도치 않은 파일 변경이 없는지 확인하고, 있으면 되돌린 뒤 커밋한다.

## File Structure

**백엔드 (신규)**

| 파일 | 책임 |
|---|---|
| `backend/src/entities/Season.entity.ts` | Season 엔티티 |
| `backend/src/repository/season.repository.ts` | Season CRUD 쿼리 |
| `backend/src/repository/rankings.repository.ts` | 랭킹 원시 집계 SQL |
| `backend/src/modules/season/season.module.ts` | 모듈 배선 |
| `backend/src/modules/season/season.controller.ts` | `/season` 라우트 + 그룹 소유권 검증 |
| `backend/src/modules/season/season.service.ts` | 시즌 CRUD + 현재 시즌 지정 + 삭제 트랜잭션 |
| `backend/src/modules/season/season.request.dto.ts` | 요청 DTO |
| `backend/src/modules/log/rankings.types.ts` | 랭킹 입출력 타입 |
| `backend/src/modules/log/rankings.util.ts` | 랭킹 순수 계산 (테스트 대상) |

**백엔드 (수정)**

| 파일 | 변경 |
|---|---|
| `backend/src/entities/Game.entity.ts` | `seasonId` 컬럼 + `@Index(['groupId','seasonId'])` |
| `backend/src/entities/Group.entity.ts` | `currentSeasonId` 컬럼 |
| `backend/src/app.module.ts` | `SeasonModule` 등록 |
| `backend/src/modules/game/game.service.ts` | 생성 시 `seasonId` 스냅샷, 덮어쓰기 시 보존 |
| `backend/src/repository/ability.repository.ts` | 두 집계에 `seasonId` 조건 |
| `backend/src/repository/log.repository.ts` | `findByPlayerId`에 `seasonId` 조건 |
| `backend/src/modules/log/log.service.ts` · `log.controller.ts` · `log.request.dto.ts` · `log.module.ts` | `/log/rankings` 신설, `/log/player/:id` 시즌 필터 |
| `backend/src/modules/player/player.service.ts` · `player.controller.ts` | ability·team-impact 시즌 필터 |
| `backend/src/repository/team-impact.repository.ts` | `findFinishedGames`에 `seasonId` 조건 |

**프론트엔드**

| 파일 | 책임 |
|---|---|
| `frontend/src/lib/seasonApi.ts` (신규) | 시즌 API 클라이언트 (`teamApi.ts` 패턴) |
| `frontend/src/app/stores/seasonStore.ts` (신규) | 그룹별 시즌 선택 기억 + 해석 로직 |
| `frontend/src/app/components/SeasonSelector.tsx` (신규) | 선택기 + 관리 모달 진입 |
| `frontend/src/app/components/SeasonManageModal.tsx` (신규) | 생성/이름변경/삭제/현재 시즌 지정 |
| `frontend/src/app/rankings/page.tsx` (수정) | 서버 집계 연동 + 선택기 |
| `frontend/src/app/player/[id]/PlayerDetail.tsx` (수정) | 시즌 필터 연동 + 선택기 |

---

## Task 1: Season 엔티티 + 스키마 컬럼 + 생성/목록/이름변경

**Files:**
- Create: `backend/src/entities/Season.entity.ts`
- Create: `backend/src/repository/season.repository.ts`
- Create: `backend/src/modules/season/season.service.ts`
- Modify: `backend/src/entities/Game.entity.ts`
- Modify: `backend/src/entities/Group.entity.ts`
- Test: `backend/src/modules/season/season.service.spec.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `class Season { id: number; groupId: number; name: string; createdAt: Date }`
  - `SeasonRepository.findByGroupId(groupId: number): Promise<Season[]>`
  - `SeasonRepository.findById(id: number): Promise<Season | null>`
  - `SeasonRepository.saveSeason(season: Season): Promise<Season>`
  - `SeasonRepository.updateName(id: number, name: string): Promise<void>`
  - `SeasonService.createSeason(dto: { groupId: number; name: string }): Promise<Season>`
  - `SeasonService.getSeasons(groupId: number): Promise<{ seasons: Season[]; currentSeasonId: number | null }>`
  - `SeasonService.renameSeason(id: number, groupId: number, name: string): Promise<Season | null>`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/modules/season/season.service.spec.ts`:

```ts
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SeasonService } from './season.service';

const OWN_GROUP = 1;
const OTHER_GROUP = 2;
const SEASON_ID = 10;

// 실제 DB 없이 리포지토리 스텁만 구성한다 (player.service.group-access.spec.ts 패턴).
const createService = (
  season: { id: number; groupId: number; name: string } | null = {
    id: SEASON_ID,
    groupId: OWN_GROUP,
    name: '2026 봄',
  },
) => {
  const seasonRepository = {
    findByGroupId: jest.fn().mockResolvedValue([season].filter(Boolean)),
    findById: jest.fn().mockResolvedValue(season),
    saveSeason: jest.fn().mockImplementation((s) => Promise.resolve({ ...s, id: SEASON_ID })),
    updateName: jest.fn().mockResolvedValue(undefined),
  };
  const groupRepository = {
    findOne: jest.fn().mockResolvedValue({ id: OWN_GROUP, currentSeasonId: null }),
  };
  const dataSource = { transaction: jest.fn() };
  const service = new SeasonService(
    seasonRepository as any,
    groupRepository as any,
    dataSource as any,
  );
  return { service, seasonRepository, groupRepository };
};

describe('SeasonService.createSeason', () => {
  test('그룹과 이름으로 시즌을 저장한다', async () => {
    const { service, seasonRepository } = createService();

    const result = await service.createSeason({ groupId: OWN_GROUP, name: '2026 봄' });

    expect(seasonRepository.saveSeason).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: OWN_GROUP, name: '2026 봄' }),
    );
    expect(result.id).toBe(SEASON_ID);
  });
});

describe('SeasonService.getSeasons', () => {
  test('시즌 목록과 그룹의 현재 시즌 id를 함께 반환한다', async () => {
    const { service, groupRepository } = createService();
    groupRepository.findOne.mockResolvedValue({ id: OWN_GROUP, currentSeasonId: SEASON_ID });

    const result = await service.getSeasons(OWN_GROUP);

    expect(result.seasons).toHaveLength(1);
    expect(result.currentSeasonId).toBe(SEASON_ID);
  });

  test('그룹이 없으면 currentSeasonId는 null이다', async () => {
    const { service, groupRepository } = createService();
    groupRepository.findOne.mockResolvedValue(null);

    const result = await service.getSeasons(OWN_GROUP);

    expect(result.currentSeasonId).toBeNull();
  });
});

describe('SeasonService.renameSeason', () => {
  test('다른 그룹의 시즌이면 ForbiddenException을 던진다', async () => {
    const { service, seasonRepository } = createService({
      id: SEASON_ID,
      groupId: OTHER_GROUP,
      name: '남의 시즌',
    });

    await expect(
      service.renameSeason(SEASON_ID, OWN_GROUP, '바꾼 이름'),
    ).rejects.toThrow(ForbiddenException);
    expect(seasonRepository.updateName).not.toHaveBeenCalled();
  });

  test('시즌이 없으면 NotFoundException을 던진다', async () => {
    const { service } = createService(null);

    await expect(
      service.renameSeason(SEASON_ID, OWN_GROUP, '바꾼 이름'),
    ).rejects.toThrow(NotFoundException);
  });

  test('내 그룹의 시즌이면 이름을 바꾼다', async () => {
    const { service, seasonRepository } = createService();

    await service.renameSeason(SEASON_ID, OWN_GROUP, '2026 여름');

    expect(seasonRepository.updateName).toHaveBeenCalledWith(SEASON_ID, '2026 여름');
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
cd backend && pnpm test -- src/modules/season/season.service.spec.ts
```

Expected: FAIL — `Cannot find module './season.service'`

- [ ] **Step 3: Season 엔티티 작성**

`backend/src/entities/Season.entity.ts`:

```ts
import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

// 그룹이 직접 만드는 시즌. 경기 귀속은 생성 시점의 Group.currentSeasonId 스냅샷으로만
// 결정되므로 시작/종료일 컬럼은 두지 않는다.
@Entity()
@Unique(['groupId', 'name'])
export class Season {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('int')
  groupId: number;

  @Column('varchar', { length: 30 })
  name: string;

  @Column('timestamp', { default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
```

- [ ] **Step 4: Game·Group 엔티티에 컬럼 추가**

`backend/src/entities/Game.entity.ts` — import에 `Index`를 추가하고, `@Entity()` 아래에 인덱스를, `groupId` 컬럼 아래에 `seasonId`를 넣는다:

```ts
import { Column, Entity, Index, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { InGamePlayer } from "./InGamePlayer.entity";
import { Log } from "./Log.entity";
@Entity()
// 시즌 필터 조회는 전부 이 두 컬럼으로 걸린다.
@Index(['groupId', 'seasonId'])
export class Game {
  @PrimaryGeneratedColumn()
  id: number;
  @Column('int')
  groupId: number;
  // 경기 생성 시점의 Group.currentSeasonId 스냅샷. FK를 만들지 않는다(시즌 삭제 시 경기 보존).
  // 시즌 도입 이전 경기는 null이며 '전체' 조회에서만 보인다.
  @Column('int', { nullable: true })
  seasonId: number | null;
  @Column('date')
  date: Date;
```

`backend/src/entities/Group.entity.ts` — `customerKey` 아래에 추가:

```ts
  // 현재 시즌. 그룹당 하나이므로 Season.isCurrent 대신 여기에 둔다(단일 진실).
  // FK를 만들지 않는다 — 시즌 삭제 시 서비스가 null로 정리한다.
  @Column('int', { nullable: true })
  currentSeasonId: number | null;
```

- [ ] **Step 5: SeasonRepository 작성**

`backend/src/repository/season.repository.ts`:

```ts
import { InjectRepository } from '@nestjs/typeorm';
import { Season } from 'src/entities/Season.entity';
import { Repository } from 'typeorm';

export class SeasonRepository extends Repository<Season> {
  constructor(
    @InjectRepository(Season)
    private seasonRepository: Repository<Season>,
  ) {
    super(
      seasonRepository.target,
      seasonRepository.manager,
      seasonRepository.queryRunner,
    );
  }

  async findByGroupId(groupId: number): Promise<Season[]> {
    return this.seasonRepository.find({
      where: { groupId: Number(groupId) },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: number): Promise<Season | null> {
    return this.seasonRepository.findOne({ where: { id: Number(id) } });
  }

  async saveSeason(season: Season): Promise<Season> {
    return this.seasonRepository.save(season);
  }

  async updateName(id: number, name: string): Promise<void> {
    await this.seasonRepository.update(id, { name });
  }
}
```

- [ ] **Step 6: SeasonService 작성 (이번 태스크 범위만)**

`backend/src/modules/season/season.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { DataSource, Repository } from 'typeorm';
import { assertSameGroup } from 'src/common/group-access';
import { Season } from 'src/entities/Season.entity';
import { Group } from 'src/entities/Group.entity';
import { SeasonRepository } from 'src/repository/season.repository';

@Injectable()
export class SeasonService {
  constructor(
    private readonly seasonRepository: SeasonRepository,
    private readonly groupRepository: Repository<Group>,
    private readonly dataSource: DataSource,
  ) {}

  async createSeason(dto: { groupId: number; name: string }): Promise<Season> {
    const seasonInstance = plainToInstance(Season, {
      groupId: Number(dto.groupId),
      name: dto.name,
    });
    return this.seasonRepository.saveSeason(seasonInstance);
  }

  async getSeasons(
    groupId: number,
  ): Promise<{ seasons: Season[]; currentSeasonId: number | null }> {
    const [seasons, group] = await Promise.all([
      this.seasonRepository.findByGroupId(groupId),
      this.groupRepository.findOne({ where: { id: Number(groupId) } }),
    ]);
    return { seasons, currentSeasonId: group?.currentSeasonId ?? null };
  }

  async renameSeason(
    id: number,
    groupId: number,
    name: string,
  ): Promise<Season | null> {
    await this.assertSeasonInGroup(id, groupId);
    await this.seasonRepository.updateName(id, name);
    return this.seasonRepository.findById(id);
  }

  // 대상 시즌이 요청자의 소속 그룹 소유인지 검증하고 반환한다.
  private async assertSeasonInGroup(id: number, groupId: number) {
    const season = await this.seasonRepository.findById(id);
    if (!season) {
      throw new NotFoundException('시즌을 찾을 수 없습니다.');
    }
    assertSameGroup(groupId, season.groupId);
    return season;
  }
}
```

- [ ] **Step 7: 테스트 통과 확인**

```bash
cd backend && pnpm test -- src/modules/season/season.service.spec.ts
```

Expected: PASS (7 tests)

- [ ] **Step 8: 커밋**

```bash
cd backend && git add src/entities/Season.entity.ts src/entities/Game.entity.ts src/entities/Group.entity.ts src/repository/season.repository.ts src/modules/season/season.service.ts src/modules/season/season.service.spec.ts
git commit -m "feat: Season 엔티티와 시즌 생성·목록·이름변경 추가

Group.currentSeasonId와 Game.seasonId 컬럼을 함께 추가했다. 둘 다
FK 없이 두어 시즌이 삭제돼도 경기 기록이 보존되게 했다."
```

---

## Task 2: 시즌 삭제 + 현재 시즌 지정

**Files:**
- Modify: `backend/src/modules/season/season.service.ts`
- Test: `backend/src/modules/season/season.service.spec.ts` (Task 1 파일에 describe 추가)

**Interfaces:**
- Consumes: Task 1의 `SeasonService`, `SeasonRepository`, `Season` 엔티티
- Produces:
  - `SeasonService.deleteSeason(id: number, groupId: number): Promise<{ affectedGames: number }>`
  - `SeasonService.setCurrentSeason(groupId: number, seasonId: number | null): Promise<{ currentSeasonId: number | null }>`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/modules/season/season.service.spec.ts` 파일 **끝에** 아래를 덧붙인다. 이 describe들은 트랜잭션 매니저를 직접 스텁하므로, 파일 상단의 `createService` 헬퍼와 별개로 필요한 목을 만든다:

```ts
// 트랜잭션 안에서 manager.update / manager.delete 호출을 검증하기 위한 스텁.
const createTxService = (
  season: { id: number; groupId: number; name: string } | null = {
    id: SEASON_ID,
    groupId: OWN_GROUP,
    name: '2026 봄',
  },
  group: { id: number; currentSeasonId: number | null } | null = {
    id: OWN_GROUP,
    currentSeasonId: SEASON_ID,
  },
) => {
  const manager = {
    update: jest.fn().mockResolvedValue({ affected: 3 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const seasonRepository = {
    findById: jest.fn().mockResolvedValue(season),
  };
  const groupRepository = {
    findOne: jest.fn().mockResolvedValue(group),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const dataSource = {
    transaction: jest.fn().mockImplementation((cb) => cb(manager)),
  };
  const service = new SeasonService(
    seasonRepository as any,
    groupRepository as any,
    dataSource as any,
  );
  return { service, manager, seasonRepository, groupRepository };
};

describe('SeasonService.deleteSeason', () => {
  test('다른 그룹의 시즌이면 ForbiddenException을 던지고 아무것도 지우지 않는다', async () => {
    const { service, manager } = createTxService({
      id: SEASON_ID,
      groupId: OTHER_GROUP,
      name: '남의 시즌',
    });

    await expect(service.deleteSeason(SEASON_ID, OWN_GROUP)).rejects.toThrow(
      ForbiddenException,
    );
    expect(manager.delete).not.toHaveBeenCalled();
  });

  test('경기의 seasonId를 null로 되돌린 뒤 시즌을 지운다', async () => {
    const { service, manager } = createTxService();

    const result = await service.deleteSeason(SEASON_ID, OWN_GROUP);

    // 경기 복원이 시즌 삭제보다 먼저 일어나야 한다
    expect(manager.update).toHaveBeenCalledWith(
      Game,
      { seasonId: SEASON_ID },
      { seasonId: null },
    );
    expect(manager.delete).toHaveBeenCalledWith(Season, { id: SEASON_ID });
    expect(result.affectedGames).toBe(3);
  });

  test('삭제 대상이 현재 시즌이면 그룹의 currentSeasonId도 null로 만든다', async () => {
    const { service, manager } = createTxService();

    await service.deleteSeason(SEASON_ID, OWN_GROUP);

    expect(manager.update).toHaveBeenCalledWith(
      Group,
      { id: OWN_GROUP },
      { currentSeasonId: null },
    );
  });

  test('삭제 대상이 현재 시즌이 아니면 currentSeasonId를 건드리지 않는다', async () => {
    const { service, manager } = createTxService(
      { id: SEASON_ID, groupId: OWN_GROUP, name: '2026 봄' },
      { id: OWN_GROUP, currentSeasonId: 999 },
    );

    await service.deleteSeason(SEASON_ID, OWN_GROUP);

    expect(manager.update).not.toHaveBeenCalledWith(
      Group,
      expect.anything(),
      { currentSeasonId: null },
    );
  });
});

describe('SeasonService.setCurrentSeason', () => {
  test('다른 그룹의 시즌은 현재 시즌으로 지정할 수 없다', async () => {
    const { service, groupRepository } = createTxService({
      id: SEASON_ID,
      groupId: OTHER_GROUP,
      name: '남의 시즌',
    });

    await expect(
      service.setCurrentSeason(OWN_GROUP, SEASON_ID),
    ).rejects.toThrow(ForbiddenException);
    expect(groupRepository.update).not.toHaveBeenCalled();
  });

  test('내 그룹의 시즌이면 현재 시즌으로 지정한다', async () => {
    const { service, groupRepository } = createTxService();

    const result = await service.setCurrentSeason(OWN_GROUP, SEASON_ID);

    expect(groupRepository.update).toHaveBeenCalledWith(OWN_GROUP, {
      currentSeasonId: SEASON_ID,
    });
    expect(result.currentSeasonId).toBe(SEASON_ID);
  });

  test('null이면 시즌 조회 없이 현재 시즌을 해제한다', async () => {
    const { service, groupRepository, seasonRepository } = createTxService();

    const result = await service.setCurrentSeason(OWN_GROUP, null);

    expect(seasonRepository.findById).not.toHaveBeenCalled();
    expect(groupRepository.update).toHaveBeenCalledWith(OWN_GROUP, {
      currentSeasonId: null,
    });
    expect(result.currentSeasonId).toBeNull();
  });
});
```

파일 상단의 import에 엔티티를 추가한다:

```ts
import { Game } from 'src/entities/Game.entity';
import { Group } from 'src/entities/Group.entity';
import { Season } from 'src/entities/Season.entity';
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
cd backend && pnpm test -- src/modules/season/season.service.spec.ts
```

Expected: FAIL — `service.deleteSeason is not a function`

- [ ] **Step 3: 메서드 구현**

`backend/src/modules/season/season.service.ts`의 `Game` import를 추가하고, `renameSeason` 아래에 넣는다:

```ts
  // 시즌을 지우되 경기 기록은 보존한다.
  // 순서: 경기 seasonId 복원 → 현재 시즌 정리 → 시즌 삭제 (한 트랜잭션)
  async deleteSeason(
    id: number,
    groupId: number,
  ): Promise<{ affectedGames: number }> {
    await this.assertSeasonInGroup(id, groupId);
    const group = await this.groupRepository.findOne({
      where: { id: Number(groupId) },
    });
    const wasCurrent = group?.currentSeasonId === Number(id);

    return this.dataSource.transaction(async (manager) => {
      const restored = await manager.update(
        Game,
        { seasonId: Number(id) },
        { seasonId: null },
      );
      if (wasCurrent) {
        await manager.update(
          Group,
          { id: Number(groupId) },
          { currentSeasonId: null },
        );
      }
      await manager.delete(Season, { id: Number(id) });
      return { affectedGames: restored.affected ?? 0 };
    });
  }

  // seasonId가 null이면 현재 시즌을 해제한다.
  async setCurrentSeason(
    groupId: number,
    seasonId: number | null,
  ): Promise<{ currentSeasonId: number | null }> {
    if (seasonId === null || seasonId === undefined) {
      await this.groupRepository.update(Number(groupId), {
        currentSeasonId: null,
      });
      return { currentSeasonId: null };
    }
    // 다른 그룹의 시즌을 자기 현재 시즌으로 지정하는 것을 막는다.
    await this.assertSeasonInGroup(seasonId, groupId);
    await this.groupRepository.update(Number(groupId), {
      currentSeasonId: Number(seasonId),
    });
    return { currentSeasonId: Number(seasonId) };
  }
```

`Game` import를 파일 상단에 추가한다:

```ts
import { Game } from 'src/entities/Game.entity';
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd backend && pnpm test -- src/modules/season/season.service.spec.ts
```

Expected: PASS (14 tests)

- [ ] **Step 5: 커밋**

```bash
cd backend && git add src/modules/season/season.service.ts src/modules/season/season.service.spec.ts
git commit -m "feat: 시즌 삭제와 현재 시즌 지정 추가

삭제는 한 트랜잭션에서 경기의 seasonId를 null로 되돌리고 현재 시즌을
정리한 뒤 시즌을 지운다. 현재 시즌 지정은 대상 시즌이 요청자 그룹
소유인지 검증해 다른 그룹의 시즌을 지정하는 것을 막는다."
```

---

## Task 3: SeasonController + 모듈 배선

**Files:**
- Create: `backend/src/modules/season/season.request.dto.ts`
- Create: `backend/src/modules/season/season.controller.ts`
- Create: `backend/src/modules/season/season.module.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/src/modules/season/season.controller.spec.ts`

**Interfaces:**
- Consumes: Task 1·2의 `SeasonService` 전체 메서드
- Produces: HTTP 라우트 `GET /season`, `POST /season`, `PUT /season/:id`, `DELETE /season/:id`, `PUT /season/current`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/modules/season/season.controller.spec.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import { SeasonController } from './season.controller';

const OWN_GROUP = 1;
const OTHER_GROUP = 2;

const createController = () => {
  const service = {
    createSeason: jest.fn().mockResolvedValue({ id: 10 }),
    getSeasons: jest.fn().mockResolvedValue({ seasons: [], currentSeasonId: null }),
    renameSeason: jest.fn().mockResolvedValue({ id: 10 }),
    deleteSeason: jest.fn().mockResolvedValue({ affectedGames: 0 }),
    setCurrentSeason: jest.fn().mockResolvedValue({ currentSeasonId: 10 }),
  };
  const controller = new SeasonController(service as any);
  return { controller, service };
};

const req = (groupId: number) => ({ user: { groupId } });

describe('SeasonController 그룹 소유권 검증', () => {
  test('다른 그룹 id로 시즌을 만들 수 없다', async () => {
    const { controller, service } = createController();

    await expect(
      controller.createSeason(req(OWN_GROUP), {
        groupId: OTHER_GROUP,
        name: '2026 봄',
      } as any),
    ).rejects.toThrow(ForbiddenException);
    expect(service.createSeason).not.toHaveBeenCalled();
  });

  test('다른 그룹 id로 현재 시즌을 지정할 수 없다', async () => {
    const { controller, service } = createController();

    await expect(
      controller.setCurrentSeason(req(OWN_GROUP), {
        groupId: OTHER_GROUP,
        seasonId: 10,
      } as any),
    ).rejects.toThrow(ForbiddenException);
    expect(service.setCurrentSeason).not.toHaveBeenCalled();
  });

  test('삭제는 쿼리가 아니라 JWT의 groupId로 소유권을 판정한다', async () => {
    const { controller, service } = createController();

    await controller.deleteSeason(req(OWN_GROUP), 10);

    expect(service.deleteSeason).toHaveBeenCalledWith(10, OWN_GROUP);
  });

  test('내 그룹이면 시즌을 만든다', async () => {
    const { controller, service } = createController();

    await controller.createSeason(req(OWN_GROUP), {
      groupId: OWN_GROUP,
      name: '2026 봄',
    } as any);

    expect(service.createSeason).toHaveBeenCalledWith({
      groupId: OWN_GROUP,
      name: '2026 봄',
    });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
cd backend && pnpm test -- src/modules/season/season.controller.spec.ts
```

Expected: FAIL — `Cannot find module './season.controller'`

- [ ] **Step 3: DTO 작성**

`backend/src/modules/season/season.request.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class PostSeasonRequestDto {
  @IsNotEmpty()
  @IsNumber()
  groupId: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(30)
  name: string;
}

export class PutSeasonRequestDto {
  @IsNotEmpty()
  @IsNumber()
  groupId: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(30)
  name: string;
}

export class GetSeasonsRequestDto {
  @Type(() => Number)
  @IsNotEmpty()
  @IsNumber()
  groupId: number;
}

export class PutCurrentSeasonRequestDto {
  @IsNotEmpty()
  @IsNumber()
  groupId: number;

  // null은 "현재 시즌 해제"를 뜻하므로 null일 때는 숫자 검증을 건너뛴다.
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  seasonId: number | null;
}
```

- [ ] **Step 4: 컨트롤러 작성**

`backend/src/modules/season/season.controller.ts`:

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { assertSameGroup } from 'src/common/group-access';
import { SeasonService } from './season.service';
import {
  GetSeasonsRequestDto,
  PostSeasonRequestDto,
  PutCurrentSeasonRequestDto,
  PutSeasonRequestDto,
} from './season.request.dto';

@Controller('season')
export class SeasonController {
  constructor(private readonly seasonService: SeasonService) {}

  @Get()
  async getSeasons(@Query(ValidationPipe) dto: GetSeasonsRequestDto) {
    return this.seasonService.getSeasons(dto.groupId);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'))
  async createSeason(
    @Request() req,
    @Body(ValidationPipe) dto: PostSeasonRequestDto,
  ) {
    assertSameGroup(req.user.groupId, dto.groupId);
    return this.seasonService
      .createSeason({ groupId: dto.groupId, name: dto.name })
      .catch((error) => {
        if (error?.driverError?.code === '23505') {
          throw new BadRequestException('이미 있는 시즌 이름입니다.');
        }
        throw error;
      });
  }

  // 현재 시즌 지정은 :id 라우트보다 먼저 선언해야 'current'가 id로 해석되지 않는다.
  @Put('current')
  @UseGuards(AuthGuard('jwt'))
  async setCurrentSeason(
    @Request() req,
    @Body(ValidationPipe) dto: PutCurrentSeasonRequestDto,
  ) {
    assertSameGroup(req.user.groupId, dto.groupId);
    return this.seasonService.setCurrentSeason(dto.groupId, dto.seasonId);
  }

  @Put(':id')
  @UseGuards(AuthGuard('jwt'))
  async renameSeason(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body(ValidationPipe) dto: PutSeasonRequestDto,
  ) {
    assertSameGroup(req.user.groupId, dto.groupId);
    return this.seasonService
      .renameSeason(id, dto.groupId, dto.name)
      .catch((error) => {
        if (error?.driverError?.code === '23505') {
          throw new BadRequestException('이미 있는 시즌 이름입니다.');
        }
        throw error;
      });
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  async deleteSeason(@Request() req, @Param('id', ParseIntPipe) id: number) {
    // 쿼리의 groupId는 신뢰하지 않고 JWT의 groupId로 소유권을 검증한다.
    return this.seasonService.deleteSeason(id, req.user.groupId);
  }
}
```

- [ ] **Step 5: 모듈 작성 및 등록**

`SeasonService`는 `Group`을 표준 TypeORM `Repository`로 주입받는다 (전용 `GroupRepository`의 도메인 메서드가 필요 없다). `Repository<Group>`은 런타임 DI 토큰이 될 수 없으므로 `@InjectRepository(Group)` 데코레이터를 쓴다.

`season.service.ts`의 import와 생성자를 다음으로 교체한다:

```ts
import { InjectRepository } from '@nestjs/typeorm';
```

```ts
  constructor(
    private readonly seasonRepository: SeasonRepository,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    private readonly dataSource: DataSource,
  ) {}
```

`backend/src/modules/season/season.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Season } from 'src/entities/Season.entity';
import { Group } from 'src/entities/Group.entity';
import { Game } from 'src/entities/Game.entity';
import { SeasonService } from './season.service';
import { SeasonController } from './season.controller';
import { SeasonRepository } from 'src/repository/season.repository';

@Module({
  // Game은 삭제 트랜잭션에서 manager.update(Game, ...)로 쓴다.
  imports: [TypeOrmModule.forFeature([Season, Group, Game])],
  controllers: [SeasonController],
  providers: [SeasonService, SeasonRepository],
})
export class SeasonModule {}
```

`backend/src/app.module.ts` — import 추가와 imports 배열 등록:

```ts
import { SeasonModule } from './modules/season/season.module';
```

`HealthModule,` 다음 줄에 `SeasonModule,`을 추가한다.

- [ ] **Step 6: 테스트 통과 확인**

```bash
cd backend && pnpm test -- src/modules/season/
```

Expected: PASS (18 tests — Task 1·2의 14개 + 이번 4개)

- [ ] **Step 7: 빌드 확인**

```bash
cd backend && pnpm build
```

Expected: 에러 없이 완료

- [ ] **Step 8: 커밋**

```bash
cd backend && git add src/modules/season/ src/app.module.ts
git commit -m "feat: 시즌 CRUD 엔드포인트 추가

PUT /season/current를 :id 라우트보다 먼저 선언해 'current'가 id로
해석되지 않게 했다. 쓰기는 전부 JWT의 groupId로 소유권을 검증한다."
```

---

## Task 4: 경기 생성 시 seasonId 스냅샷

**Files:**
- Modify: `backend/src/modules/game/game.service.ts`
- Test: `backend/src/modules/game/game.service.season.spec.ts`

**Interfaces:**
- Consumes: Task 1의 `Game.seasonId`, `Group.currentSeasonId`
- Produces: 신규 경기의 `seasonId`가 생성 시점 `Group.currentSeasonId`와 같아진다. 기존 경기 덮어쓰기 시 `seasonId`는 변하지 않는다.

**핵심:** `seasonId`는 **DTO에서 받지 않는다.** 클라이언트가 보내면 임의 시즌에 경기를 꽂을 수 있다. 서버가 `Group`을 읽어 채운다.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/modules/game/game.service.season.spec.ts`:

```ts
import { GameService } from './game.service';
import { Game } from 'src/entities/Game.entity';

const GROUP_ID = 1;
const CURRENT_SEASON_ID = 42;

// saveGameAndLogs의 seasonId 결정 로직만 확인하기 위한 최소 스텁.
const createService = (options: {
  currentSeasonId: number | null;
  existingGame?: { id: number; groupId: number; seasonId: number | null };
}) => {
  const saveGame = jest.fn().mockResolvedValue({ id: 500 });
  const gameRepository = {
    saveGame,
    findOne: jest.fn().mockResolvedValue(options.existingGame ?? null),
  };
  const inGamePlayersRepository = {
    emptyInGamePlayers: jest.fn().mockResolvedValue(undefined),
    saveInGamePlayers: jest.fn().mockResolvedValue(undefined),
  };
  const logRepository = {
    emptyLog: jest.fn().mockResolvedValue(undefined),
    saveLog: jest.fn().mockResolvedValue(undefined),
  };
  const manager = {
    findOne: jest.fn().mockImplementation((entity: any) => {
      if (entity === Game) {
        return Promise.resolve({ id: 500 });
      }
      // Group 조회
      return Promise.resolve({
        id: GROUP_ID,
        currentSeasonId: options.currentSeasonId,
      });
    }),
    count: jest.fn().mockResolvedValue(1),
    getRepository: jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue({ id: 500 }),
    }),
    save: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const queryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager,
  };
  const dataSource = {
    createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    getRepository: jest.fn().mockReturnValue({ count: jest.fn().mockResolvedValue(0) }),
  };
  const service = new GameService(
    gameRepository as any,
    inGamePlayersRepository as any,
    logRepository as any,
    dataSource as any,
  );
  return { service, saveGame, gameRepository };
};

describe('GameService seasonId 스냅샷', () => {
  test('resolveSeasonId는 그룹의 현재 시즌을 반환한다', async () => {
    const { service } = createService({ currentSeasonId: CURRENT_SEASON_ID });

    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: GROUP_ID,
        currentSeasonId: CURRENT_SEASON_ID,
      }),
    };

    const result = await (service as any).resolveSeasonId(manager, GROUP_ID, undefined);

    expect(result).toBe(CURRENT_SEASON_ID);
  });

  test('현재 시즌이 없으면 null이다', async () => {
    const { service } = createService({ currentSeasonId: null });

    const manager = {
      findOne: jest.fn().mockResolvedValue({ id: GROUP_ID, currentSeasonId: null }),
    };

    const result = await (service as any).resolveSeasonId(manager, GROUP_ID, undefined);

    expect(result).toBeNull();
  });

  test('그룹을 찾지 못하면 null이다', async () => {
    const { service } = createService({ currentSeasonId: null });

    const manager = { findOne: jest.fn().mockResolvedValue(null) };

    const result = await (service as any).resolveSeasonId(manager, GROUP_ID, undefined);

    expect(result).toBeNull();
  });

  test('기존 경기를 덮어쓸 때는 그 경기의 seasonId를 유지한다', async () => {
    const { service } = createService({ currentSeasonId: CURRENT_SEASON_ID });

    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: GROUP_ID,
        currentSeasonId: CURRENT_SEASON_ID,
      }),
    };

    // 기존 경기 id가 주어지면 현재 시즌을 조회하지 않고 원래 값을 쓴다
    const result = await (service as any).resolveSeasonId(manager, GROUP_ID, 7);

    expect(result).toBe(7);
    expect(manager.findOne).not.toHaveBeenCalled();
  });

  test('기존 경기의 seasonId가 null이면 null을 유지한다', async () => {
    const { service } = createService({ currentSeasonId: CURRENT_SEASON_ID });

    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: GROUP_ID,
        currentSeasonId: CURRENT_SEASON_ID,
      }),
    };

    const result = await (service as any).resolveSeasonId(manager, GROUP_ID, null);

    expect(result).toBeNull();
    expect(manager.findOne).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
cd backend && pnpm test -- src/modules/game/game.service.season.spec.ts
```

Expected: FAIL — `service.resolveSeasonId is not a function`

- [ ] **Step 3: `resolveSeasonId` 헬퍼 추가**

`backend/src/modules/game/game.service.ts`의 클래스 안, `assertGameInGroup` 아래에 추가한다:

```ts
  // 경기의 시즌을 결정한다.
  // 신규 경기(existingSeasonId === undefined)는 그룹의 현재 시즌을 스냅샷으로 복사하고,
  // 기존 경기를 덮어쓰는 경우에는 원래 seasonId를 그대로 유지한다.
  // seasonId를 DTO에서 받지 않는 이유: 클라이언트가 임의 시즌에 경기를 꽂을 수 있다.
  private async resolveSeasonId(
    manager: { findOne(entity: any, options: any): Promise<any> },
    groupId: number,
    existingSeasonId: number | null | undefined,
  ): Promise<number | null> {
    if (existingSeasonId !== undefined) {
      return existingSeasonId;
    }
    const group = await manager.findOne(Group, {
      where: { id: Number(groupId) },
    });
    return group?.currentSeasonId ?? null;
  }
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd backend && pnpm test -- src/modules/game/game.service.season.spec.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: `saveGameAndLogs`에서 호출하도록 연결**

`backend/src/modules/game/game.service.ts`에서 `const gameInstance = plainToInstance(Game, {` 블록을 찾아 앞뒤를 다음으로 교체한다:

```ts
      const {
        id,
        groupId,
        homePlayers,
        awayPlayers,
        homeTeamName,
        awayTeamName,
        logs,
      } = dto;

      // 기존 경기를 덮어쓰는 경우 원래 시즌을 유지한다.
      const existingGame = id
        ? await queryRunner.manager.findOne(Game, { where: { id: Number(id) } })
        : null;
      const seasonId = await this.resolveSeasonId(
        queryRunner.manager,
        groupId,
        existingGame ? (existingGame.seasonId ?? null) : undefined,
      );

      const gameInstance = plainToInstance(Game, {
        id,
        groupId,
        seasonId,
        date: new Date(),
        homeTeamName,
        awayTeamName,
      });
```

- [ ] **Step 6: 전체 백엔드 테스트 통과 확인**

```bash
cd backend && pnpm test
```

Expected: 모든 테스트 PASS. 기존 game 관련 spec이 깨지면, 그 spec의 `queryRunner.manager` 스텁에 `findOne`이 없어서일 수 있다 — 해당 스텁에 `findOne: jest.fn().mockResolvedValue(null)`을 추가해 고친다.

- [ ] **Step 7: 커밋**

```bash
cd backend && git add src/modules/game/game.service.ts src/modules/game/game.service.season.spec.ts
git commit -m "feat: 경기 생성 시 현재 시즌을 seasonId로 스냅샷

seasonId는 DTO에서 받지 않고 서버가 Group.currentSeasonId를 읽어
채운다. 클라이언트가 보내면 임의 시즌에 경기를 꽂을 수 있기 때문이다.
기존 경기를 덮어쓸 때는 원래 seasonId를 유지한다."
```

---

## Task 5: 랭킹 순수 계산 로직

**Files:**
- Create: `backend/src/modules/log/rankings.types.ts`
- Create: `backend/src/modules/log/rankings.util.ts`
- Test: `backend/src/modules/log/rankings.util.spec.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces:
  - `computeRankings(input: { rows: RankingAggRow[]; gamesPlayed: RankingGamesPlayed[] }): RankingsResponse`
  - 타입: `RankingAggRow`, `RankingGamesPlayed`, `RankingPlayer`, `RankingItem`, `RankingsResponse`

**이 태스크가 설계의 3.3(고치는 기존 동작 2건) 중 자유투 건을 구현한다.** 삭제 경기 제외는 Task 6의 SQL에서 처리한다.

- [ ] **Step 1: 타입 파일 작성**

`backend/src/modules/log/rankings.types.ts`:

```ts
// RankingsRepository가 돌려주는 (선수 x 기록항목) 집계 한 줄
export interface RankingAggRow {
  playerId: number;
  playerName: string;
  backnumber: string | null;
  logitemId: number;
  logitemName: string;
  logitemValue: number;
  count: number;
  valueSum: number;
}

export interface RankingGamesPlayed {
  playerId: number;
  gamesPlayed: number;
}

export interface RankingPlayer {
  playerId: number;
  playerName: string;
  number: string | null;
  totalCount: number;
  avgPerGame: number;
  gamesPlayed: number;
  // 득점 종합 항목에서만 채워진다 (프론트 정렬이 이 필드를 쓴다)
  totalScore?: number;
  avgScore?: number;
}

export interface RankingItem {
  id: number; // logitem id. 득점 종합은 -1
  name: string;
  value: number;
  players: RankingPlayer[];
}

export interface RankingsResponse {
  rankings: RankingItem[];
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`backend/src/modules/log/rankings.util.spec.ts`:

```ts
import { computeRankings } from './rankings.util';
import { RankingAggRow } from './rankings.types';

const row = (over: Partial<RankingAggRow>): RankingAggRow => ({
  playerId: 1,
  playerName: '선수1',
  backnumber: '7',
  logitemId: 1,
  logitemName: '3점',
  logitemValue: 3,
  count: 2,
  valueSum: 6,
  ...over,
});

describe('computeRankings', () => {
  test('기록 항목별로 선수 집계를 만든다', () => {
    const result = computeRankings({
      rows: [row({}), row({ playerId: 2, playerName: '선수2', count: 1, valueSum: 3 })],
      gamesPlayed: [
        { playerId: 1, gamesPlayed: 2 },
        { playerId: 2, gamesPlayed: 1 },
      ],
    });

    const threePoint = result.rankings.find((r) => r.name === '3점');
    expect(threePoint).toBeDefined();
    expect(threePoint!.id).toBe(1);
    expect(threePoint!.value).toBe(3);
    expect(threePoint!.players).toHaveLength(2);

    const p1 = threePoint!.players.find((p) => p.playerId === 1)!;
    expect(p1.totalCount).toBe(2);
    expect(p1.gamesPlayed).toBe(2);
    expect(p1.avgPerGame).toBe(1);
    expect(p1.number).toBe('7');
  });

  test('출전 경기가 0이면 평균은 0이다 (0으로 나누지 않는다)', () => {
    const result = computeRankings({
      rows: [row({})],
      gamesPlayed: [],
    });

    const threePoint = result.rankings.find((r) => r.name === '3점')!;
    expect(threePoint.players[0].gamesPlayed).toBe(0);
    expect(threePoint.players[0].avgPerGame).toBe(0);
  });

  test("이름에 '자유투'가 든 항목은 랭킹 목록에서 숨긴다", () => {
    const result = computeRankings({
      rows: [
        row({}),
        row({ logitemId: 5, logitemName: '자유투1점', logitemValue: 1, count: 4, valueSum: 4 }),
      ],
      gamesPlayed: [{ playerId: 1, gamesPlayed: 2 }],
    });

    expect(result.rankings.some((r) => r.name.includes('자유투'))).toBe(false);
  });

  test('득점 종합은 자유투를 포함한 전체 valueSum으로 계산한다', () => {
    const result = computeRankings({
      rows: [
        row({}), // 3점 x2 = 6점
        row({ logitemId: 5, logitemName: '자유투1점', logitemValue: 1, count: 4, valueSum: 4 }),
        row({ logitemId: 6, logitemName: '자유투2점', logitemValue: 2, count: 1, valueSum: 2 }),
      ],
      gamesPlayed: [{ playerId: 1, gamesPlayed: 2 }],
    });

    const scoring = result.rankings.find((r) => r.name === '득점')!;
    expect(scoring.id).toBe(-1);
    const p1 = scoring.players[0];
    expect(p1.totalScore).toBe(12); // 6 + 4 + 2
    expect(p1.totalCount).toBe(12); // 화면은 totalCount를 표시한다
    expect(p1.avgScore).toBe(6);
    expect(p1.avgPerGame).toBe(6);
  });

  test('득점 종합을 목록 맨 앞에 넣는다', () => {
    const result = computeRankings({
      rows: [row({})],
      gamesPlayed: [{ playerId: 1, gamesPlayed: 2 }],
    });

    expect(result.rankings[0].name).toBe('득점');
  });

  test('아무도 득점이 없으면 득점 종합 항목을 넣지 않는다', () => {
    const result = computeRankings({
      rows: [
        row({ logitemId: 2, logitemName: '리바', logitemValue: 0, count: 5, valueSum: 0 }),
      ],
      gamesPlayed: [{ playerId: 1, gamesPlayed: 2 }],
    });

    expect(result.rankings.some((r) => r.name === '득점')).toBe(false);
    expect(result.rankings).toHaveLength(1);
  });

  test('로그가 없으면 빈 목록을 반환한다', () => {
    const result = computeRankings({ rows: [], gamesPlayed: [] });

    expect(result.rankings).toEqual([]);
  });
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

```bash
cd backend && pnpm test -- src/modules/log/rankings.util.spec.ts
```

Expected: FAIL — `Cannot find module './rankings.util'`

- [ ] **Step 4: 구현 작성**

`backend/src/modules/log/rankings.util.ts`:

```ts
import {
  RankingAggRow,
  RankingGamesPlayed,
  RankingItem,
  RankingPlayer,
  RankingsResponse,
} from './rankings.types';

// 득점 종합 항목의 가상 id (실제 logitem이 아니다)
const SCORING_ITEM_ID = -1;
const SCORING_ITEM_NAME = '득점';

// 랭킹 목록에 노출하지 않는 항목. 득점 종합에는 포함된다.
const isHiddenItem = (name: string) => name.includes('자유투');

const perGame = (total: number, gamesPlayed: number) =>
  gamesPlayed > 0 ? total / gamesPlayed : 0;

interface ComputeInput {
  rows: RankingAggRow[];
  gamesPlayed: RankingGamesPlayed[];
}

export function computeRankings(input: ComputeInput): RankingsResponse {
  const { rows, gamesPlayed } = input;

  const gamesByPlayer = new Map<number, number>();
  gamesPlayed.forEach((g) => gamesByPlayer.set(g.playerId, g.gamesPlayed));

  // 1) 항목별 랭킹 (숨김 항목 제외)
  const itemsById = new Map<number, RankingItem>();
  rows.forEach((r) => {
    if (isHiddenItem(r.logitemName)) return;

    let item = itemsById.get(r.logitemId);
    if (!item) {
      item = {
        id: r.logitemId,
        name: r.logitemName,
        value: r.logitemValue,
        players: [],
      };
      itemsById.set(r.logitemId, item);
    }
    const games = gamesByPlayer.get(r.playerId) ?? 0;
    item.players.push({
      playerId: r.playerId,
      playerName: r.playerName,
      number: r.backnumber,
      totalCount: r.count,
      avgPerGame: perGame(r.count, games),
      gamesPlayed: games,
    });
  });

  // 2) 득점 종합 — 숨김 항목(자유투)을 포함한 전체 valueSum
  const scoreByPlayer = new Map<number, { name: string; number: string | null; score: number }>();
  rows.forEach((r) => {
    const entry = scoreByPlayer.get(r.playerId) ?? {
      name: r.playerName,
      number: r.backnumber,
      score: 0,
    };
    entry.score += r.valueSum;
    scoreByPlayer.set(r.playerId, entry);
  });

  const scoringPlayers: RankingPlayer[] = [];
  scoreByPlayer.forEach((entry, playerId) => {
    const games = gamesByPlayer.get(playerId) ?? 0;
    const avg = perGame(entry.score, games);
    scoringPlayers.push({
      playerId,
      playerName: entry.name,
      number: entry.number,
      // 화면은 totalCount/avgPerGame을 표시하고 정렬은 totalScore/avgScore를 쓴다
      totalCount: entry.score,
      avgPerGame: avg,
      gamesPlayed: games,
      totalScore: entry.score,
      avgScore: avg,
    });
  });

  const rankings = Array.from(itemsById.values());
  const hasScore = scoringPlayers.some((p) => (p.totalScore ?? 0) > 0);

  return {
    rankings: hasScore
      ? [
          {
            id: SCORING_ITEM_ID,
            name: SCORING_ITEM_NAME,
            value: 1,
            players: scoringPlayers,
          },
          ...rankings,
        ]
      : rankings,
  };
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd backend && pnpm test -- src/modules/log/rankings.util.spec.ts
```

Expected: PASS (7 tests)

- [ ] **Step 6: 커밋**

```bash
cd backend && git add src/modules/log/rankings.types.ts src/modules/log/rankings.util.ts src/modules/log/rankings.util.spec.ts
git commit -m "feat: 랭킹 순수 계산 로직 추가

ability.util 패턴을 따라 집계 계산을 순수 함수로 분리했다. 득점
종합을 자유투를 포함한 전체 valueSum으로 계산하도록 바꿨다 — 기존
프론트 계산은 자유투 항목을 걸러낸 목록으로 득점까지 합산해 자유투
득점이 총득점에서 빠져 있었다."
```

---

## Task 6: 랭킹 집계 SQL + `/log/rankings` 엔드포인트

**Files:**
- Create: `backend/src/repository/rankings.repository.ts`
- Modify: `backend/src/repository/ability.repository.ts`
- Modify: `backend/src/modules/log/log.service.ts`
- Modify: `backend/src/modules/log/log.controller.ts`
- Modify: `backend/src/modules/log/log.request.dto.ts`
- Modify: `backend/src/modules/log/log.module.ts`
- Test: `backend/src/repository/rankings.repository.spec.ts`

**Interfaces:**
- Consumes: Task 5의 `computeRankings`, `RankingAggRow`, `RankingGamesPlayed`
- Produces:
  - `RankingsRepository.aggregateRankings(groupId: number, seasonId?: number | null): Promise<RankingAggRow[]>`
  - `AbilityRepository.aggregateGroupAbility(groupId: number, seasonId?: number | null)` — 시그니처 확장
  - `AbilityRepository.aggregateGamesPlayed(groupId: number, seasonId?: number | null)` — 시그니처 확장
  - `LogService.getRankings(groupId: number, seasonId?: number): Promise<RankingsResponse>`
  - HTTP `GET /log/rankings?groupId=&seasonId=`

**이 태스크가 설계 3.3의 "삭제 경기 제외"를 구현한다.**

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/repository/rankings.repository.spec.ts`:

```ts
import { RankingsRepository } from './rankings.repository';

// 실제 DB 없이 쿼리 빌더 호출만 검증한다 (log.repository.daily.spec.ts 패턴).
const createRepository = () => {
  const qb: any = {
    innerJoin: jest.fn(() => qb),
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    groupBy: jest.fn(() => qb),
    addGroupBy: jest.fn(() => qb),
    getRawMany: jest.fn().mockResolvedValue([]),
  };
  const inner = { createQueryBuilder: jest.fn(() => qb) };
  const repository = new RankingsRepository(inner as any);
  return { repository, qb };
};

describe('RankingsRepository.aggregateRankings', () => {
  test('삭제된 게임을 제외한다', async () => {
    const { repository, qb } = createRepository();

    await repository.aggregateRankings(1);

    expect(qb.andWhere).toHaveBeenCalledWith("game.status != 'DELETED'");
  });

  test('seasonId를 주면 시즌 조건을 추가한다', async () => {
    const { repository, qb } = createRepository();

    await repository.aggregateRankings(1, 42);

    expect(qb.andWhere).toHaveBeenCalledWith('game.seasonId = :seasonId', {
      seasonId: 42,
    });
  });

  test('seasonId가 없으면 시즌 조건을 넣지 않는다 (전체 조회)', async () => {
    const { repository, qb } = createRepository();

    await repository.aggregateRankings(1);

    const seasonCalls = qb.andWhere.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('seasonId'),
    );
    expect(seasonCalls).toHaveLength(0);
  });

  test('삭제된 선수를 제외하기 위해 player를 inner join한다', async () => {
    const { repository, qb } = createRepository();

    await repository.aggregateRankings(1);

    expect(qb.innerJoin).toHaveBeenCalledWith('log.player', 'player');
  });

  test('raw 결과를 숫자 타입으로 변환해 반환한다', async () => {
    const { repository, qb } = createRepository();
    qb.getRawMany.mockResolvedValue([
      {
        playerId: '3',
        playerName: '선수',
        backnumber: '7',
        logitemId: '1',
        logitemName: '3점',
        logitemValue: '3',
        count: '2',
        valueSum: '6',
      },
    ]);

    const rows = await repository.aggregateRankings(1);

    expect(rows[0]).toEqual({
      playerId: 3,
      playerName: '선수',
      backnumber: '7',
      logitemId: 1,
      logitemName: '3점',
      logitemValue: 3,
      count: 2,
      valueSum: 6,
    });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
cd backend && pnpm test -- src/repository/rankings.repository.spec.ts
```

Expected: FAIL — `Cannot find module './rankings.repository'`

- [ ] **Step 3: RankingsRepository 작성**

`backend/src/repository/rankings.repository.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Log } from 'src/entities/Log.entity';
import { RankingAggRow } from 'src/modules/log/rankings.types';

@Injectable()
export class RankingsRepository {
  constructor(
    @InjectRepository(Log)
    private readonly logRepository: Repository<Log>,
  ) {}

  // (선수 x 기록항목) 집계. 삭제 게임/삭제 선수는 제외한다.
  // seasonId가 없으면 전체(시즌 미지정 경기 포함)를 집계한다.
  async aggregateRankings(
    groupId: number,
    seasonId?: number | null,
  ): Promise<RankingAggRow[]> {
    const query = this.logRepository
      .createQueryBuilder('log')
      .innerJoin('log.logitem', 'logitem')
      .innerJoin('log.game', 'game')
      .innerJoin('log.player', 'player') // FK 제거 정책: 삭제 선수 제외
      .select('log.playerId', 'playerId')
      .addSelect('player.name', 'playerName')
      .addSelect('player.backnumber', 'backnumber')
      .addSelect('logitem.id', 'logitemId')
      .addSelect('logitem.name', 'logitemName')
      .addSelect('logitem.value', 'logitemValue')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(logitem.value)', 'valueSum')
      .where('log.groupId = :groupId', { groupId: Number(groupId) })
      .andWhere("game.status != 'DELETED'");

    if (seasonId !== undefined && seasonId !== null) {
      query.andWhere('game.seasonId = :seasonId', { seasonId: Number(seasonId) });
    }

    const rows = await query
      .groupBy('log.playerId')
      .addGroupBy('player.name')
      .addGroupBy('player.backnumber')
      .addGroupBy('logitem.id')
      .addGroupBy('logitem.name')
      .addGroupBy('logitem.value')
      .getRawMany();

    return rows.map((r) => ({
      playerId: Number(r.playerId),
      playerName: r.playerName,
      backnumber: r.backnumber ?? null,
      logitemId: Number(r.logitemId),
      logitemName: r.logitemName,
      logitemValue: Number(r.logitemValue),
      count: Number(r.count),
      valueSum: Number(r.valueSum),
    }));
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd backend && pnpm test -- src/repository/rankings.repository.spec.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: AbilityRepository에 seasonId 추가**

`backend/src/repository/ability.repository.ts`의 두 메서드를 아래로 교체한다 (기존 주석 유지):

```ts
  // 그룹 전체를 (선수 x logitem 이름)으로 집계. 삭제 게임/삭제 선수 제외.
  // seasonId가 없으면 전체(시즌 미지정 경기 포함)를 집계한다.
  async aggregateGroupAbility(
    groupId: number,
    seasonId?: number | null,
  ): Promise<AbilityRow[]> {
    const query = this.logRepository
      .createQueryBuilder('log')
      .innerJoin('log.logitem', 'logitem')
      .innerJoin('log.game', 'game')
      .innerJoin('log.player', 'player') // FK 제거 정책: INNER JOIN으로 삭제 선수 로그 제외
      .select('log.playerId', 'playerId')
      .addSelect('logitem.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(logitem.value)', 'valueSum')
      .where('log.groupId = :groupId', { groupId })
      .andWhere("game.status != 'DELETED'");

    if (seasonId !== undefined && seasonId !== null) {
      query.andWhere('game.seasonId = :seasonId', { seasonId: Number(seasonId) });
    }

    const rows = await query
      .groupBy('log.playerId')
      .addGroupBy('logitem.name')
      .getRawMany();

    return rows.map((r) => ({
      playerId: Number(r.playerId),
      name: r.name,
      count: Number(r.count),
      valueSum: Number(r.valueSum),
    }));
  }

  // 선수별 총 출전 게임 수. InGamePlayer 로스터 기준(기록 유무 무관), 삭제 게임/삭제 선수 제외.
  // seasonId가 없으면 전체(시즌 미지정 경기 포함)를 집계한다.
  async aggregateGamesPlayed(
    groupId: number,
    seasonId?: number | null,
  ): Promise<GamesPlayed[]> {
    const query = this.logRepository.manager
      .createQueryBuilder(InGamePlayer, 'igp')
      .innerJoin('igp.game', 'game')
      .innerJoin('igp.player', 'player') // FK 제거 정책: INNER JOIN으로 삭제 선수 제외
      .select('igp.playerId', 'playerId')
      .addSelect('COUNT(DISTINCT igp.gameId)', 'gamesPlayed')
      .where('igp.groupId = :groupId', { groupId })
      .andWhere("game.status != 'DELETED'");

    if (seasonId !== undefined && seasonId !== null) {
      query.andWhere('game.seasonId = :seasonId', { seasonId: Number(seasonId) });
    }

    const rows = await query.groupBy('igp.playerId').getRawMany();

    return rows.map((r) => ({
      playerId: Number(r.playerId),
      gamesPlayed: Number(r.gamesPlayed),
    }));
  }
```

- [ ] **Step 6: DTO에 seasonId 추가**

`backend/src/modules/log/log.request.dto.ts` 파일 **끝에** 추가한다:

```ts
export class GetRankingsRequestDto {
  @Type(() => Number)
  @IsNotEmpty()
  @IsNumber()
  groupId: number;

  // 생략하면 전체(시즌 미지정 경기 포함)를 집계한다.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  seasonId?: number;
}
```

파일 상단 import에 `IsOptional`을 추가한다:

```ts
import { IsNotEmpty, IsNumber, IsOptional, IsString, Matches } from 'class-validator';
```

- [ ] **Step 7: 서비스·컨트롤러·모듈 배선**

`backend/src/modules/log/log.service.ts` — 생성자에 `RankingsRepository`와 `AbilityRepository`를 추가하고 메서드를 넣는다:

```ts
import { RankingsRepository } from 'src/repository/rankings.repository';
import { AbilityRepository } from 'src/repository/ability.repository';
import { computeRankings } from './rankings.util';
import { RankingsResponse } from './rankings.types';
```

생성자 파라미터 목록 끝에 추가:

```ts
    private readonly rankingsRepository: RankingsRepository,
    private readonly abilityRepository: AbilityRepository,
```

클래스 안에 메서드 추가:

```ts
  // 랭킹 집계. seasonId가 없으면 전체(시즌 미지정 경기 포함).
  async getRankings(
    groupId: number,
    seasonId?: number,
  ): Promise<RankingsResponse> {
    const [rows, gamesPlayed] = await Promise.all([
      this.rankingsRepository.aggregateRankings(groupId, seasonId),
      this.abilityRepository.aggregateGamesPlayed(groupId, seasonId),
    ]);
    return computeRankings({ rows, gamesPlayed });
  }
```

`backend/src/modules/log/log.controller.ts` — import에 `GetRankingsRequestDto`를 추가하고, `@Get('/daily')` **위에** 라우트를 넣는다 (구체 경로를 파라미터 라우트보다 먼저 선언):

```ts
  @Get('/rankings')
  async getRankings(@Query(ValidationPipe) dto: GetRankingsRequestDto) {
    return this.logService.getRankings(dto.groupId, dto.seasonId);
  }
```

`backend/src/modules/log/log.module.ts` — providers에 두 리포지토리를 추가한다:

```ts
import { RankingsRepository } from 'src/repository/rankings.repository';
import { AbilityRepository } from 'src/repository/ability.repository';
import { InGamePlayer } from 'src/entities/InGamePlayer.entity';
```

```ts
  imports: [TypeOrmModule.forFeature([Game, Logitem, Player, Group, Log, InGamePlayer])],
  controllers: [LogController],
  providers: [
    LogService,
    LogRepository,
    GameRepository,
    RankingsRepository,
    AbilityRepository,
  ],
```

- [ ] **Step 8: 전체 테스트 + 빌드 확인**

```bash
cd backend && pnpm test && pnpm build
```

Expected: 모든 테스트 PASS, 빌드 성공. 기존 `player.service.ability.spec.ts`가 `toHaveBeenCalledWith(7)`로 단언하는데 이제 인자가 하나 더 붙을 수 있다 — Task 7에서 함께 정리하므로, 여기서 실패하면 **Task 7까지 진행한 뒤 다시 확인**한다. 이 단계에서는 `aggregateGroupAbility(7)` 호출이 그대로이므로 통과해야 정상이다.

- [ ] **Step 9: 커밋**

```bash
cd backend && git add src/repository/rankings.repository.ts src/repository/rankings.repository.spec.ts src/repository/ability.repository.ts src/modules/log/
git commit -m "feat: 랭킹 서버 집계 엔드포인트 GET /log/rankings 추가

기존 프론트 집계는 항목별 N회 + 선수별 M×2회 요청을 보냈다. SQL
집계 한 번으로 대체하고 삭제된 게임을 제외했다 — 기존 랭킹 조회에는
game.status 필터가 없어 삭제한 경기의 기록이 계속 포함됐다.
능력치 집계에도 seasonId 조건을 추가했다."
```

---

## Task 7: 선수 상세의 시즌 필터 (능력치·팀 기여도·경기별 기록)

**Files:**
- Modify: `backend/src/modules/player/player.service.ts`
- Modify: `backend/src/modules/player/player.controller.ts`
- Modify: `backend/src/repository/team-impact.repository.ts`
- Modify: `backend/src/repository/log.repository.ts`
- Modify: `backend/src/modules/log/log.service.ts`
- Modify: `backend/src/modules/log/log.controller.ts`
- Test: `backend/src/modules/player/player.service.ability.spec.ts` (기존 파일 수정)
- Test: `backend/src/modules/player/player.service.season.spec.ts` (신규)

**Interfaces:**
- Consumes: Task 6의 `AbilityRepository` 확장 시그니처
- Produces:
  - `PlayerService.getPlayerAbility(id: number, seasonId?: number)`
  - `PlayerService.getPlayerTeamImpact(id: number, seasonId?: number)`
  - `TeamImpactRepository.findFinishedGames(playerId: number, seasonId?: number | null)`
  - `LogRepository.findByPlayerId(playerId: number, seasonId?: number | null)`
  - `LogService.getLogByPlayerId(id: number, seasonId?: number)`
  - HTTP: `GET /player/:id/ability?seasonId=`, `GET /player/:id/team-impact?seasonId=`, `GET /log/player/:id?seasonId=`

**설계 문서 2.2에서 `GET /log/player/:id`가 누락되어 있었다.** 선수 상세의 경기별 기록 표가 이 API를 쓰므로, 능력치만 시즌을 따르면 같은 화면에서 기준이 갈린다. 이 태스크에 포함한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/modules/player/player.service.season.spec.ts`:

```ts
import { PlayerService } from './player.service';

const PLAYER_ID = 1;
const GROUP_ID = 7;
const SEASON_ID = 42;

const makeService = () => {
  const playerRepository = {
    findById: jest.fn().mockResolvedValue({ id: PLAYER_ID, groupId: GROUP_ID }),
  };
  const abilityRepository = {
    aggregateGroupAbility: jest.fn().mockResolvedValue([]),
    aggregateGamesPlayed: jest.fn().mockResolvedValue([]),
  };
  const teamImpactRepository = {
    findFinishedGames: jest.fn().mockResolvedValue([]),
    aggregateTeamByItem: jest.fn().mockResolvedValue([]),
    aggregateSelfByItem: jest.fn().mockResolvedValue([]),
    findTeammates: jest.fn().mockResolvedValue([]),
  };
  const service = new PlayerService(
    playerRepository as any,
    {} as any, // inGamePlayersRepository (미사용)
    abilityRepository as any,
    teamImpactRepository as any,
  );
  return { service, abilityRepository, teamImpactRepository };
};

describe('PlayerService 시즌 필터', () => {
  test('능력치 집계에 seasonId를 전달한다', async () => {
    const { service, abilityRepository } = makeService();

    await service.getPlayerAbility(PLAYER_ID, SEASON_ID);

    expect(abilityRepository.aggregateGroupAbility).toHaveBeenCalledWith(
      GROUP_ID,
      SEASON_ID,
    );
    expect(abilityRepository.aggregateGamesPlayed).toHaveBeenCalledWith(
      GROUP_ID,
      SEASON_ID,
    );
  });

  test('seasonId가 없으면 undefined를 전달한다 (전체 집계)', async () => {
    const { service, abilityRepository } = makeService();

    await service.getPlayerAbility(PLAYER_ID);

    expect(abilityRepository.aggregateGroupAbility).toHaveBeenCalledWith(
      GROUP_ID,
      undefined,
    );
  });

  test('팀 기여도의 완료 경기 조회에 seasonId를 전달한다', async () => {
    const { service, teamImpactRepository } = makeService();

    await service.getPlayerTeamImpact(PLAYER_ID, SEASON_ID);

    expect(teamImpactRepository.findFinishedGames).toHaveBeenCalledWith(
      PLAYER_ID,
      SEASON_ID,
    );
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
cd backend && pnpm test -- src/modules/player/player.service.season.spec.ts
```

Expected: FAIL — `aggregateGroupAbility`가 `(7)`로만 호출되어 단언 불일치

- [ ] **Step 3: PlayerService 수정**

`backend/src/modules/player/player.service.ts`의 두 메서드 시그니처와 호출을 수정한다:

```ts
  async getPlayerAbility(
    id: number,
    seasonId?: number,
  ): Promise<PlayerAbility> {
    const player = await this.playerRepository.findById(id);
    if (!player) {
      throw new NotFoundException('선수를 찾을 수 없습니다.');
    }
    const groupId = player.groupId;
    const [rows, gamesPlayed] = await Promise.all([
      this.abilityRepository.aggregateGroupAbility(groupId, seasonId),
      this.abilityRepository.aggregateGamesPlayed(groupId, seasonId),
    ]);
    return computeAbility({ rows, gamesPlayed, targetPlayerId: id, groupId });
  }

  async getPlayerTeamImpact(
    id: number,
    seasonId?: number,
  ): Promise<PlayerTeamImpact> {
    const player = await this.playerRepository.findById(id);
    if (!player) {
      throw new NotFoundException('선수를 찾을 수 없습니다.');
    }
    const groupId = player.groupId;
    const games = await this.teamImpactRepository.findFinishedGames(
      id,
      seasonId,
    );
    const gameIds = games.map((g) => g.gameId);
    const [teamAgg, selfAgg, roster] = await Promise.all([
      this.teamImpactRepository.aggregateTeamByItem(gameIds),
      this.teamImpactRepository.aggregateSelfByItem(id, gameIds),
      this.teamImpactRepository.findTeammates(id, gameIds),
    ]);
    return computeTeamImpact({
      games,
      teamAgg,
      selfAgg,
      roster,
      targetPlayerId: id,
      groupId,
    });
  }
```

- [ ] **Step 4: 기존 ability spec의 단언 갱신**

`backend/src/modules/player/player.service.ability.spec.ts`에서 아래 두 줄을 찾아 두 번째 인자를 추가한다:

```ts
    expect(abilityRepository.aggregateGroupAbility).toHaveBeenCalledWith(7, undefined);
    expect(abilityRepository.aggregateGamesPlayed).toHaveBeenCalledWith(7, undefined);
```

- [ ] **Step 5: 리포지토리 두 곳에 seasonId 조건 추가**

`backend/src/repository/team-impact.repository.ts`의 `findFinishedGames`를 교체한다:

```ts
  // 대상 선수의 완료(FINISHED) 경기 + 소속 팀 + 날짜
  // seasonId가 없으면 전체(시즌 미지정 경기 포함).
  async findFinishedGames(
    playerId: number,
    seasonId?: number | null,
  ): Promise<GameRow[]> {
    const query = this.logRepository.manager
      .createQueryBuilder(InGamePlayer, 'igp')
      .innerJoin('igp.game', 'game')
      .select('igp.gameId', 'gameId')
      .addSelect('igp.team', 'team')
      // getRawMany는 엔티티 날짜 문자열화를 적용하지 않아 raw Date가 오므로,
      // SQL에서 ISO 문자열로 포맷한다 (log.repository의 TO_CHAR 규칙과 동일).
      .addSelect("TO_CHAR(game.date, 'YYYY-MM-DD')", 'date')
      .where('igp.playerId = :playerId', { playerId })
      .andWhere("game.status = 'FINISHED'");

    if (seasonId !== undefined && seasonId !== null) {
      query.andWhere('game.seasonId = :seasonId', { seasonId: Number(seasonId) });
    }

    const rows = await query.getRawMany();
    return rows.map((r) => ({
      gameId: Number(r.gameId),
      team: r.team,
      date: String(r.date),
    }));
  }
```

`backend/src/repository/log.repository.ts`의 `findByPlayerId`를 교체한다:

```ts
  // seasonId가 없으면 전체(시즌 미지정 경기 포함).
  async findByPlayerId(
    playerId: number,
    seasonId?: number | null,
  ): Promise<Log[] | null> {
    const where: Record<string, unknown> = { playerId };
    if (seasonId !== undefined && seasonId !== null) {
      where.game = { seasonId: Number(seasonId) };
    }
    return this.logRepository.find({
      where,
      relations: ['logitem', 'player', 'game'],
    });
  }
```

- [ ] **Step 6: 컨트롤러에 쿼리 파라미터 추가**

`backend/src/modules/player/player.controller.ts`의 두 라우트를 교체한다. `seasonId`는 원시 타입 파라미터이므로 DTO가 필요 없다 (ValidationPipe가 건너뛴다):

```ts
  @Get(':id/ability')
  async getPlayerAbility(
    @Param('id', ParseIntPipe) id: number,
    @Query('seasonId') seasonId?: string,
  ) {
    return this.playerService.getPlayerAbility(
      id,
      seasonId ? Number(seasonId) : undefined,
    );
  }

  @Get(':id/team-impact')
  async getPlayerTeamImpact(
    @Param('id', ParseIntPipe) id: number,
    @Query('seasonId') seasonId?: string,
  ) {
    return this.playerService.getPlayerTeamImpact(
      id,
      seasonId ? Number(seasonId) : undefined,
    );
  }
```

`backend/src/modules/log/log.service.ts`의 `getLogByPlayerId`에 파라미터를 넘긴다 (기존 시그니처 확인 후 `findByPlayerId(id)` 호출을 `findByPlayerId(id, seasonId)`로 바꾸고 메서드 시그니처에 `seasonId?: number`를 추가).

`backend/src/modules/log/log.controller.ts`의 라우트를 교체한다:

```ts
  @Get('/player/:id')
  async getLogByPlayerId(
    @Param('id') id: number,
    @Query('seasonId') seasonId?: string,
  ) {
    return this.logService.getLogByPlayerId(
      id,
      seasonId ? Number(seasonId) : undefined,
    );
  }
```

- [ ] **Step 7: 전체 테스트 + 빌드 확인**

```bash
cd backend && pnpm test && pnpm build
```

Expected: 모든 테스트 PASS, 빌드 성공

- [ ] **Step 8: 커밋**

```bash
cd backend && git add src/modules/player/ src/modules/log/ src/repository/team-impact.repository.ts src/repository/log.repository.ts
git commit -m "feat: 선수 상세 조회에 시즌 필터 추가

능력치·팀 기여도·경기별 기록 세 조회 모두에 seasonId를 붙였다.
선수 상세는 시즌 선택기가 하나뿐이라 일부만 시즌을 따르면 같은
화면에서 기준이 갈린다."
```

---

## Task 8: 프론트 시즌 API 클라이언트 + 선택 상태 스토어

**Files:**
- Create: `frontend/src/lib/seasonApi.ts`
- Create: `frontend/src/app/stores/seasonStore.ts`

**Interfaces:**
- Consumes: Task 3의 `/season` 엔드포인트들
- Produces:
  - `type Season = { id: number; name: string; createdAt: string }`
  - `type SeasonSelection = number | 'all'`
  - `fetchSeasons(groupId: number): Promise<{ seasons: Season[]; currentSeasonId: number | null }>`
  - `createSeason(groupId: number, name: string): Promise<Season>`
  - `renameSeason(id: number, groupId: number, name: string): Promise<Season>`
  - `deleteSeason(id: number): Promise<{ affectedGames: number }>`
  - `setCurrentSeason(groupId: number, seasonId: number | null): Promise<{ currentSeasonId: number | null }>`
  - `resolveSeasonSelection(stored, seasons, currentSeasonId): SeasonSelection`
  - `useSeasonStore` — `{ selectionByGroup, setSelection, getSelection }`
  - `toSeasonParam(selection: SeasonSelection): number | undefined`

- [ ] **Step 1: API 클라이언트 작성**

`frontend/src/lib/seasonApi.ts` (`teamApi.ts`와 같은 위치·패턴):

```ts
import { api } from "@/lib/axios";

export interface Season {
  id: number;
  name: string;
  createdAt: string;
}

export interface SeasonsResponse {
  seasons: Season[];
  currentSeasonId: number | null;
}

export const fetchSeasons = async (groupId: number): Promise<SeasonsResponse> => {
  const response = await api.get(`/season?groupId=${groupId}`);
  return response.data;
};

export const createSeason = async (groupId: number, name: string): Promise<Season> => {
  const response = await api.post("/season", { groupId, name });
  return response.data;
};

export const renameSeason = async (
  id: number,
  groupId: number,
  name: string
): Promise<Season> => {
  const response = await api.put(`/season/${id}`, { groupId, name });
  return response.data;
};

export const deleteSeason = async (id: number): Promise<{ affectedGames: number }> => {
  const response = await api.delete(`/season/${id}`);
  return response.data;
};

export const setCurrentSeason = async (
  groupId: number,
  seasonId: number | null
): Promise<{ currentSeasonId: number | null }> => {
  const response = await api.put("/season/current", { groupId, seasonId });
  return response.data;
};
```

**주의:** `@/lib/axios`를 쓴다. `src/app/lib/axios.ts`는 아무 곳에서도 import하지 않는 레거시 중복 파일이다.

- [ ] **Step 2: 선택 상태 스토어 작성**

`frontend/src/app/stores/seasonStore.ts`:

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Season } from "@/lib/seasonApi";

// 'all' = 전체(시즌 미지정 경기 포함)
export type SeasonSelection = number | "all";

interface SeasonState {
  // 그룹을 바꿨을 때 이전 그룹의 시즌이 남아 빈 화면이 나오지 않도록 그룹별로 기억한다.
  selectionByGroup: Record<number, SeasonSelection>;
  setSelection: (groupId: number, selection: SeasonSelection) => void;
}

export const useSeasonStore = create<SeasonState>()(
  persist(
    (set) => ({
      selectionByGroup: {},
      setSelection: (groupId, selection) =>
        set((state) => ({
          selectionByGroup: { ...state.selectionByGroup, [groupId]: selection },
        })),
    }),
    { name: "season-storage" }
  )
);

// 저장된 선택 → 현재 시즌 → 전체 순으로 해석한다.
// 저장된 시즌이 삭제됐으면 존재 검증에서 걸러져 다음 후보로 넘어간다.
export const resolveSeasonSelection = (
  stored: SeasonSelection | undefined,
  seasons: Season[],
  currentSeasonId: number | null
): SeasonSelection => {
  if (stored === "all") return "all";
  if (typeof stored === "number" && seasons.some((s) => s.id === stored)) {
    return stored;
  }
  if (currentSeasonId !== null && seasons.some((s) => s.id === currentSeasonId)) {
    return currentSeasonId;
  }
  return "all";
};

// API 쿼리 파라미터로 변환한다. 'all'이면 파라미터를 생략한다(= 전체).
export const toSeasonParam = (selection: SeasonSelection): number | undefined =>
  selection === "all" ? undefined : selection;

// 쿼리스트링 조각을 만든다. 예: "&seasonId=42" 또는 ""
export const seasonQuery = (selection: SeasonSelection): string =>
  selection === "all" ? "" : `&seasonId=${selection}`;
```

- [ ] **Step 3: 빌드·린트 확인**

```bash
cd frontend && pnpm build && pnpm lint && git status --short
```

Expected: 빌드 성공, 린트 통과. `git status`에 이 태스크가 만든 두 파일 외의 변경이 있으면 `git checkout -- <파일>`로 되돌린다 (`pnpm lint`는 `--fix`라 저장소 전체를 고친다).

- [ ] **Step 4: 커밋**

```bash
cd frontend && git add src/lib/seasonApi.ts src/app/stores/seasonStore.ts
git commit -m "feat: 시즌 API 클라이언트와 선택 상태 스토어 추가

선택은 그룹별로 기억한다. 그룹을 바꿨을 때 이전 그룹의 시즌이 남아
빈 화면이 나오는 것을 막기 위해서다. 해석 순서는 저장된 선택 →
현재 시즌 → 전체이며, 삭제된 시즌은 존재 검증에서 걸러진다."
```

---

## Task 9: SeasonSelector + 시즌 관리 모달

**Files:**
- Create: `frontend/src/app/components/SeasonSelector.tsx`
- Create: `frontend/src/app/components/SeasonManageModal.tsx`

**Interfaces:**
- Consumes: Task 8의 `seasonApi`, `useSeasonStore`, `resolveSeasonSelection`
- Produces:
  - `<SeasonSelector groupId={number} selection={SeasonSelection} seasons={Season[]} currentSeasonId={number | null} onChange={(s: SeasonSelection) => void} onSeasonsChanged={() => void} />`
  - `<SeasonManageModal isOpen groupId seasons currentSeasonId onClose onChanged />`

- [ ] **Step 1: 시즌 관리 모달 작성**

`frontend/src/app/components/SeasonManageModal.tsx`:

```tsx
"use client";

import React, { useState } from "react";
import styled from "styled-components";
import {
  Season,
  createSeason,
  deleteSeason,
  renameSeason,
  setCurrentSeason,
} from "@/lib/seasonApi";
import { useToast } from "./ui/Toast";
import { useConfirm } from "./ui/ConfirmDialog";

interface Props {
  isOpen: boolean;
  groupId: number;
  seasons: Season[];
  currentSeasonId: number | null;
  onClose: () => void;
  onChanged: () => void;
}

export default function SeasonManageModal({
  isOpen,
  groupId,
  seasons,
  currentSeasonId,
  onClose,
  onChanged,
}: Props) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      showToast("시즌 이름을 입력해주세요.", "error");
      return;
    }
    setBusy(true);
    try {
      await createSeason(groupId, name);
      setNewName("");
      showToast("시즌을 만들었습니다.", "success");
      onChanged();
    } catch (error: any) {
      showToast(
        error?.response?.data?.message ?? "시즌 생성에 실패했습니다.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (season: Season) => {
    const name = window.prompt("새 시즌 이름", season.name)?.trim();
    if (!name || name === season.name) return;
    setBusy(true);
    try {
      await renameSeason(season.id, groupId, name);
      showToast("시즌 이름을 바꿨습니다.", "success");
      onChanged();
    } catch (error: any) {
      showToast(
        error?.response?.data?.message ?? "이름 변경에 실패했습니다.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (season: Season) => {
    const ok = await confirm({
      title: "시즌을 삭제할까요?",
      message: `"${season.name}"에 속한 경기는 삭제되지 않고 시즌 미지정으로 돌아갑니다.`,
      confirmText: "삭제",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const { affectedGames } = await deleteSeason(season.id);
      showToast(
        `시즌을 삭제했습니다. 경기 ${affectedGames}건이 시즌 미지정으로 돌아갔습니다.`,
        "success"
      );
      onChanged();
    } catch (error: any) {
      showToast(
        error?.response?.data?.message ?? "시즌 삭제에 실패했습니다.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSetCurrent = async (seasonId: number | null) => {
    setBusy(true);
    try {
      await setCurrentSeason(groupId, seasonId);
      showToast(
        seasonId === null
          ? "현재 시즌을 해제했습니다."
          : "현재 시즌을 지정했습니다.",
        "success"
      );
      onChanged();
    } catch (error: any) {
      showToast(
        error?.response?.data?.message ?? "현재 시즌 지정에 실패했습니다.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay onClick={onClose}>
      <Panel onClick={(e) => e.stopPropagation()}>
        <Title>시즌 관리</Title>

        <CreateRow>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="예: 2026 봄 리그"
            maxLength={30}
            disabled={busy}
          />
          <PrimaryButton onClick={handleCreate} disabled={busy}>
            추가
          </PrimaryButton>
        </CreateRow>

        <List>
          {seasons.length === 0 && <Empty>아직 만든 시즌이 없습니다.</Empty>}
          {seasons.map((season) => (
            <Row key={season.id}>
              <RowName>
                {season.name}
                {season.id === currentSeasonId && <Badge>현재 시즌</Badge>}
              </RowName>
              <RowActions>
                {season.id === currentSeasonId ? (
                  <TextButton onClick={() => handleSetCurrent(null)} disabled={busy}>
                    해제
                  </TextButton>
                ) : (
                  <TextButton
                    onClick={() => handleSetCurrent(season.id)}
                    disabled={busy}
                  >
                    현재로
                  </TextButton>
                )}
                <TextButton onClick={() => handleRename(season)} disabled={busy}>
                  이름
                </TextButton>
                <DangerButton onClick={() => handleDelete(season)} disabled={busy}>
                  삭제
                </DangerButton>
              </RowActions>
            </Row>
          ))}
        </List>

        <CloseButton onClick={onClose}>닫기</CloseButton>
      </Panel>
    </Overlay>
  );
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
`;

const Panel = styled.div`
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  width: 100%;
  max-width: 420px;
  max-height: 80vh;
  overflow-y: auto;
`;

const Title = styled.h2`
  margin: 0 0 16px;
  font-size: 18px;
  font-weight: 700;
`;

const CreateRow = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
`;

const Input = styled.input`
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
`;

const PrimaryButton = styled.button`
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Empty = styled.p`
  color: #888;
  font-size: 14px;
  text-align: center;
  padding: 16px 0;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid #eee;
  border-radius: 8px;
`;

const RowName = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
`;

const Badge = styled.span`
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
`;

const RowActions = styled.div`
  display: flex;
  gap: 4px;
`;

const TextButton = styled.button`
  background: none;
  border: none;
  color: #2563eb;
  font-size: 13px;
  cursor: pointer;
  padding: 4px 6px;
  &:disabled {
    opacity: 0.5;
  }
`;

const DangerButton = styled(TextButton)`
  color: #dc2626;
`;

const CloseButton = styled.button`
  width: 100%;
  margin-top: 16px;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  cursor: pointer;
`;
```

위 호출부는 실제 시그니처와 일치한다 (확인 완료):
- `useToast(): { showToast: (message: string, type?: ToastType) => void }`
- `useConfirm(): (options: { title: string; message?: string; confirmText?: string; cancelText?: string; danger?: boolean }) => Promise<boolean>`

두 훅의 사용 예시는 `frontend/src/app/teams/page.tsx`에도 있다.

- [ ] **Step 2: SeasonSelector 작성**

`frontend/src/app/components/SeasonSelector.tsx`:

```tsx
"use client";

import React, { useState } from "react";
import styled from "styled-components";
import type { Season } from "@/lib/seasonApi";
import type { SeasonSelection } from "../stores/seasonStore";
import SeasonManageModal from "./SeasonManageModal";

interface Props {
  groupId: number;
  seasons: Season[];
  currentSeasonId: number | null;
  selection: SeasonSelection;
  canManage: boolean;
  onChange: (selection: SeasonSelection) => void;
  onSeasonsChanged: () => void;
}

export default function SeasonSelector({
  groupId,
  seasons,
  currentSeasonId,
  selection,
  canManage,
  onChange,
  onSeasonsChanged,
}: Props) {
  const [isManageOpen, setIsManageOpen] = useState(false);

  // 시즌이 없는 그룹에서는 선택기를 숨긴다.
  // 단 그룹장에게는 만들 진입점을 남긴다 — 없으면 시즌을 만들 방법이 없다.
  if (seasons.length === 0) {
    if (!canManage) return null;
    return (
      <>
        <Bar>
          <ManageButton onClick={() => setIsManageOpen(true)}>
            + 시즌 만들기
          </ManageButton>
        </Bar>
        <SeasonManageModal
          isOpen={isManageOpen}
          groupId={groupId}
          seasons={seasons}
          currentSeasonId={currentSeasonId}
          onClose={() => setIsManageOpen(false)}
          onChanged={onSeasonsChanged}
        />
      </>
    );
  }

  return (
    <>
      <Bar>
        <Select
          value={selection === "all" ? "all" : String(selection)}
          onChange={(e) =>
            onChange(e.target.value === "all" ? "all" : Number(e.target.value))
          }
        >
          <option value="all">전체 기간</option>
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name}
              {season.id === currentSeasonId ? " (현재)" : ""}
            </option>
          ))}
        </Select>
        {canManage && (
          <ManageButton onClick={() => setIsManageOpen(true)}>시즌 관리</ManageButton>
        )}
      </Bar>
      <SeasonManageModal
        isOpen={isManageOpen}
        groupId={groupId}
        seasons={seasons}
        currentSeasonId={currentSeasonId}
        onClose={() => setIsManageOpen(false)}
        onChanged={onSeasonsChanged}
      />
    </>
  );
}

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
`;

const Select = styled.select`
  flex: 1;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  background: #fff;
`;

const ManageButton = styled.button`
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
`;
```

- [ ] **Step 3: 빌드·린트 확인**

```bash
cd frontend && pnpm build && pnpm lint && git status --short
```

Expected: 빌드 성공, 린트 통과, 이 태스크의 두 파일 외 변경 없음

- [ ] **Step 4: 커밋**

```bash
cd frontend && git add src/app/components/SeasonSelector.tsx src/app/components/SeasonManageModal.tsx
git commit -m "feat: 시즌 선택기와 관리 모달 추가

시즌이 없는 그룹에서는 선택기를 숨기되 그룹장에게는 '시즌 만들기'
진입점을 남긴다. 없으면 시즌을 만들 방법 자체가 없기 때문이다."
```

---

## Task 10: 랭킹 페이지를 서버 집계로 전환

**Files:**
- Modify: `frontend/src/app/rankings/page.tsx`
- Modify: `frontend/src/types/player.ts` (`PlayerRanking`에서 `teamId`·`position` 제거)

**Interfaces:**
- Consumes: Task 6의 `GET /log/rankings`, Task 8의 스토어, Task 9의 `SeasonSelector`
- Produces: 없음 (최종 화면)

- [ ] **Step 1: 기존 집계 코드 제거 및 교체**

`frontend/src/app/rankings/page.tsx`에서 `calculatePlayerStats` 함수와 `fetchRankings`의 `useEffect` 전체(로그 항목 조회 ~ `setRankings(...)`)를 아래로 교체한다. `LogItem`, `LogItemData`, `PlayerStats` 인터페이스도 더 이상 쓰지 않으므로 삭제한다.

import에 추가:

```tsx
import SeasonSelector from "../components/SeasonSelector";
import { useSeasonStore, resolveSeasonSelection, seasonQuery, SeasonSelection } from "../stores/seasonStore";
import { fetchSeasons, Season } from "@/lib/seasonApi";
import { useAuthStore } from "../stores/useAuthStore";
```

컴포넌트 상단 상태에 추가:

```tsx
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [currentSeasonId, setCurrentSeasonId] = useState<number | null>(null);
  const [selection, setSelection] = useState<SeasonSelection>("all");
  const { selectionByGroup, setSelection: persistSelection } = useSeasonStore();
  const user = useAuthStore((state) => state.user);
  const canManage = !!user && user.groupId === selectedGroup;
```

시즌 목록 로드 + 선택 해석 useEffect:

```tsx
  // 시즌 목록을 받아 저장된 선택을 해석한다.
  const loadSeasons = React.useCallback(async () => {
    if (!selectedGroup) return;
    try {
      const data = await fetchSeasons(selectedGroup);
      setSeasons(data.seasons);
      setCurrentSeasonId(data.currentSeasonId);
      setSelection(
        resolveSeasonSelection(
          selectionByGroup[selectedGroup],
          data.seasons,
          data.currentSeasonId
        )
      );
    } catch (err) {
      // 시즌 조회 실패는 전체 기간으로 폴백한다 — 랭킹 자체는 보여준다.
      console.error("시즌 목록을 불러오지 못했습니다:", err);
      setSeasons([]);
      setCurrentSeasonId(null);
      setSelection("all");
    }
  }, [selectedGroup, selectionByGroup]);

  useEffect(() => {
    loadSeasons();
  }, [selectedGroup]);
```

랭킹 조회 useEffect (기존 것을 통째로 대체):

```tsx
  useEffect(() => {
    const fetchRankings = async () => {
      if (!selectedGroup) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const response = await api.get(
          `/log/rankings?groupId=${selectedGroup}${seasonQuery(selection)}`
        );
        setRankings(response.data.rankings ?? []);
      } catch (err) {
        console.error("랭킹 데이터를 불러오는데 실패했습니다:", err);
        setError("랭킹 데이터를 불러오는데 실패했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchRankings();
  }, [selectedGroup, selection]);
```

선택 변경 핸들러:

```tsx
  const handleSeasonChange = (next: SeasonSelection) => {
    setSelection(next);
    if (selectedGroup) persistSelection(selectedGroup, next);
  };
```

- [ ] **Step 2: 빈 상태 처리 순서 수정**

`if (rankings.length === 0) { return <EmptyState .../> }`는 선택기까지 숨겨버려 시즌을 바꿀 수 없게 만든다. 이 early return을 삭제하고, 렌더 트리 안에서 처리한다. `return (` 블록의 `<S.Header>` **위**에 선택기를, 랭킹 목록 자리에 조건부 빈 상태를 넣는다:

```tsx
  return (
    <S.Container>
      {selectedGroup && (
        <SeasonSelector
          groupId={selectedGroup}
          seasons={seasons}
          currentSeasonId={currentSeasonId}
          selection={selection}
          canManage={canManage}
          onChange={handleSeasonChange}
          onSeasonsChanged={loadSeasons}
        />
      )}

      <S.Header>
        <S.TabContainer>
          <S.TabButton isSelected={selectedTab === "total"} onClick={() => setSelectedTab("total")}>
            전체 기록
          </S.TabButton>
          <S.TabButton isSelected={selectedTab === "average"} onClick={() => setSelectedTab("average")}>
            게임당 평균
          </S.TabButton>
        </S.TabContainer>
      </S.Header>

      {filteredRankings.length === 0 && (
        <EmptyState message="이 기간에는 기록이 없습니다." />
      )}

      {filteredRankings.map((ranking) => (
```

- [ ] **Step 3: `position` 참조 제거**

`frontend/src/types/player.ts`의 `PlayerRanking`에서 `teamId`와 `position`을 삭제한다 (`Player` 엔티티에 없는 컬럼이라 항상 `undefined`였다).

`rankings/page.tsx`의 배지 두 곳을 고친다 (`TopThree`와 `PlayerList` 각각):

```tsx
                    <S.PlayerBadge>#{player.number}</S.PlayerBadge>
```

`teamId`/`position`을 참조하는 다른 곳이 있으면 함께 정리한다:

```bash
cd frontend && grep -rn "position\|teamId" src/types/player.ts src/app/rankings/
```

- [ ] **Step 4: 빌드·린트 확인**

```bash
cd frontend && pnpm build && pnpm lint && git status --short
```

Expected: 빌드 성공, 린트 통과

- [ ] **Step 5: 수동 스모크**

백엔드와 프론트를 띄우고 확인한다:

```bash
cd /Users/onady/project/dngg && docker compose up -d db
cd backend && pnpm dev    # 별도 터미널, :3010
cd frontend && pnpm dev   # 별도 터미널, :3011
```

`http://localhost:3011/rankings`에서:
- 시즌이 없는 그룹: 선택기가 안 보이고 랭킹이 예전처럼 나온다 (로그인 시 "+ 시즌 만들기"만 보인다)
- 시즌을 만들고 "현재로" 지정 → 선택기에 나타난다
- 새 시즌 선택 → 경기가 없으므로 "이 기간에는 기록이 없습니다"
- "전체 기간"으로 되돌리면 다시 기록이 보인다
- 새로고침해도 마지막 선택이 유지된다
- 네트워크 탭에서 `/log/rankings` **한 번만** 호출되는지 확인 (기존 40여 회 요청이 사라졌는지)

- [ ] **Step 6: 커밋**

```bash
cd frontend && git add src/app/rankings/page.tsx src/types/player.ts
git commit -m "feat: 랭킹 페이지를 서버 집계와 시즌 필터로 전환

항목별 N회 + 선수별 M×2회 요청을 /log/rankings 한 번으로 줄였다.
빈 상태를 early return에서 렌더 트리 안으로 옮겼다 — early return이면
기록 없는 시즌에서 선택기까지 사라져 되돌릴 방법이 없어진다."
```

---

## Task 11: 선수 상세 페이지 시즌 필터

**Files:**
- Modify: `frontend/src/app/player/[id]/PlayerDetail.tsx`

**Interfaces:**
- Consumes: Task 7의 시즌 필터 엔드포인트들, Task 8의 스토어, Task 9의 `SeasonSelector`
- Produces: 없음 (최종 화면)

- [ ] **Step 1: 시즌 상태 추가**

`frontend/src/app/player/[id]/PlayerDetail.tsx`의 import에 추가:

```tsx
import SeasonSelector from "@/app/components/SeasonSelector";
import {
  useSeasonStore,
  resolveSeasonSelection,
  seasonQuery,
  SeasonSelection,
} from "@/app/stores/seasonStore";
import { fetchSeasons, Season } from "@/lib/seasonApi";
import { useAuthStore } from "@/app/stores/useAuthStore";
```

상태 추가:

```tsx
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [currentSeasonId, setCurrentSeasonId] = useState<number | null>(null);
  const [selection, setSelection] = useState<SeasonSelection>("all");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [seasonsReady, setSeasonsReady] = useState(false);
  const { selectionByGroup, setSelection: persistSelection } = useSeasonStore();
  const user = useAuthStore((state) => state.user);
  const canManage = !!user && groupId !== null && user.groupId === groupId;
```

- [ ] **Step 2: 시즌 목록 로드를 선행시키기**

선수 데이터 조회는 선수의 `groupId`를 먼저 알아야 하므로, 시즌 로드도 선수 조회 뒤에 온다. 기존 `useEffect` 안에서 `playerData`를 받은 직후에 시즌을 로드하고, **시즌 해석이 끝난 뒤에만** 나머지를 조회하도록 두 단계로 나눈다.

기존 `useEffect`의 시작부를 다음으로 교체한다:

```tsx
  // 1단계: 선수 정보 → 그룹 확보 → 시즌 목록 로드 → 선택 해석
  useEffect(() => {
    const loadPlayerAndSeasons = async () => {
      try {
        setError(null);
        const playerResponse = await api.get(`/player/${playerId}`);
        const playerData = playerResponse.data;
        setPlayer(playerData);
        setGroupId(playerData.groupId);

        // 같은 그룹 선수 목록(선수 전환 콤보박스용)은 독립 처리 —
        // 실패해도 페이지 나머지 렌더에 영향 없이 콤보박스만 숨긴다.
        api
          .get(`/player?groupId=${playerData.groupId}`)
          .then((res) => setGroupPlayers(res.data))
          .catch((e) => {
            console.error("Error fetching group players:", e);
            setGroupPlayers([]);
          });

        try {
          const seasonData = await fetchSeasons(playerData.groupId);
          setSeasons(seasonData.seasons);
          setCurrentSeasonId(seasonData.currentSeasonId);
          setSelection(
            resolveSeasonSelection(
              selectionByGroup[playerData.groupId],
              seasonData.seasons,
              seasonData.currentSeasonId
            )
          );
        } catch (e) {
          // 시즌 조회 실패는 전체 기간으로 폴백한다.
          console.error("시즌 목록을 불러오지 못했습니다:", e);
          setSeasons([]);
          setCurrentSeasonId(null);
          setSelection("all");
        }
        setSeasonsReady(true);
      } catch (error) {
        console.error("Error fetching player data:", error);
        setError("데이터를 불러오는데 실패했습니다");
        setLoading(false);
      }
    };

    loadPlayerAndSeasons();
  }, [playerId]);
```

- [ ] **Step 3: 기록 조회를 selection 의존으로 분리**

같은 파일에 두 번째 `useEffect`를 추가한다. 기존 `useEffect`에 있던 로그·logitem 조회와 `gameRecords` 계산 로직(`logsByGame` 구성부터 `setAllLogItemNames`까지)을 이쪽으로 옮긴다:

```tsx
  // 2단계: 선택된 시즌으로 기록·능력치·팀 기여도를 조회한다.
  useEffect(() => {
    if (!seasonsReady || groupId === null) return;

    const fetchSeasonScopedData = async () => {
      try {
        setLoading(true);
        const query = seasonQuery(selection);

        const [logsResponse, logItemsResponse] = await Promise.all([
          api.get(`/log/player/${playerId}?${query.replace(/^&/, "")}`),
          api.get(`/logitem?groupId=${groupId}`),
        ]);
        const allLogItems = logItemsResponse.data;

        // 게임별로 로그 그룹화
        const logsByGame = new Map<number, PlayerLog[]>();
        logsResponse.data.forEach((log: PlayerLog) => {
          const gameId = log.gameId;
          if (!logsByGame.has(gameId)) {
            logsByGame.set(gameId, []);
          }
          logsByGame.get(gameId)?.push(log);
        });

        // 게임별 기록 생성
        const records: GameRecord[] = [];

        logsByGame.forEach((logs) => {
          if (logs.length === 0) return;

          const gameInfo = logs[0].game;
          const logSummary = new Map<string, { count: number; value: number }>();

          logs.forEach((log) => {
            const key = log.logitem.name;
            const existing = logSummary.get(key);
            if (existing) {
              existing.count += 1;
            } else {
              logSummary.set(key, { count: 1, value: log.logitem.value });
            }
          });

          const totalScore = logs.reduce((sum, log) => sum + log.logitem.value, 0);

          records.push({
            gameId: gameInfo.id,
            gameName: gameInfo.name,
            gameDate: gameInfo.date,
            logs: Array.from(logSummary.entries()).map(([name, stats]) => ({
              name,
              count: stats.count,
              value: stats.value,
            })),
            totalScore,
          });
        });

        const sortedRecords = records.sort(
          (a: GameRecord, b: GameRecord) =>
            new Date(b.gameDate).getTime() - new Date(a.gameDate).getTime()
        );

        setGameRecords(sortedRecords);
        setAllLogItemNames(allLogItems.map((item: LogItem) => item.name));

        // 능력치는 실패해도 나머지 렌더에 영향 없도록 독립 처리
        api
          .get(`/player/${playerId}/ability?${query.replace(/^&/, "")}`)
          .then((res) => setAbility(res.data))
          .catch((e) => {
            console.error("Error fetching ability:", e);
            setAbility(null);
          });

        // 팀 기여도도 실패해도 나머지 렌더에 영향 없도록 독립 처리
        api
          .get(`/player/${playerId}/team-impact?${query.replace(/^&/, "")}`)
          .then((res) => setTeamImpact(res.data))
          .catch((e) => {
            console.error("Error fetching team impact:", e);
            setTeamImpact(null);
          });
      } catch (error) {
        console.error("Error fetching season scoped data:", error);
        setError("데이터를 불러오는데 실패했습니다");
      } finally {
        setLoading(false);
      }
    };

    fetchSeasonScopedData();
  }, [playerId, groupId, selection, seasonsReady]);
```

- [ ] **Step 4: 선택기 렌더**

`PlayerDetail.tsx`가 `PlayerDetailClient`를 렌더하는 부분을 감싸 선택기를 위에 놓는다:

```tsx
  const handleSeasonChange = (next: SeasonSelection) => {
    setSelection(next);
    if (groupId !== null) persistSelection(groupId, next);
  };
```

```tsx
  return (
    <>
      {groupId !== null && (
        <div style={{ padding: "16px 16px 0" }}>
          <SeasonSelector
            groupId={groupId}
            seasons={seasons}
            currentSeasonId={currentSeasonId}
            selection={selection}
            canManage={canManage}
            onChange={handleSeasonChange}
            onSeasonsChanged={async () => {
              const data = await fetchSeasons(groupId);
              setSeasons(data.seasons);
              setCurrentSeasonId(data.currentSeasonId);
            }}
          />
        </div>
      )}
      <PlayerDetailClient
        player={player}
        gameRecords={gameRecords}
        allLogItemNames={allLogItemNames}
        ability={ability}
        teamImpact={teamImpact}
        groupPlayers={groupPlayers}
      />
    </>
  );
```

기존 로딩/에러 early return은 그대로 둔다.

- [ ] **Step 5: 빌드·린트 확인**

```bash
cd frontend && pnpm build && pnpm lint && git status --short
```

Expected: 빌드 성공, 린트 통과

- [ ] **Step 6: 수동 스모크**

`http://localhost:3011/player/<id>`에서:
- 시즌 선택기가 페이지 상단에 보인다
- 시즌을 바꾸면 경기별 기록 표, 능력치 레이더, 팀 기여도 카드가 **모두** 그 시즌 기준으로 바뀐다
- 경기가 없는 시즌에서 능력치 카드가 깨지지 않는다 (빈 상태 또는 축이 비어 있음)
- 랭킹 페이지에서 고른 시즌이 선수 상세에도 유지된다 (같은 그룹이면 같은 선택)

- [ ] **Step 7: 커밋**

```bash
cd frontend && git add src/app/player/\[id\]/PlayerDetail.tsx
git commit -m "feat: 선수 상세에 시즌 필터 연동

선수의 groupId를 알아야 시즌을 조회할 수 있어 선수 조회와 시즌
조회를 1단계, 시즌 의존 데이터를 2단계로 나눴다. 경기별 기록·능력치·
팀 기여도가 모두 같은 시즌 기준을 따른다."
```

---

## Task 12: 통합 검증

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 백엔드 전체 테스트**

```bash
cd backend && pnpm test
```

Expected: 전부 PASS

- [ ] **Step 2: 백엔드·프론트 빌드**

```bash
cd backend && pnpm build && cd ../frontend && pnpm build
```

Expected: 둘 다 성공

- [ ] **Step 3: 회귀 스모크 — 시즌을 쓰지 않는 경로**

시즌이 하나도 없는 그룹으로 확인한다. 시즌 도입 전과 동일해야 한다:

- `/rankings` — 랭킹이 나온다 (단, 삭제 경기 제외·자유투 포함으로 숫자가 소폭 달라지는 것은 의도된 변화)
- `/player/<id>` — 능력치·팀 기여도·경기별 기록이 나온다
- `/games`에서 경기 생성 → 정상 생성되고 `seasonId`가 null이다
- `/daily` — 영향 없음

- [ ] **Step 4: 시즌 경로 스모크**

- 시즌 A 생성 → 현재 시즌 지정 → 경기 생성 → 그 경기가 시즌 A에 귀속되는지 DB로 확인:
  ```bash
  docker compose exec db psql -U postgres -d dngg -c 'SELECT id, "groupId", "seasonId", status FROM game ORDER BY id DESC LIMIT 3;'
  ```
- 현재 시즌 해제 → 경기 생성 → `seasonId`가 null인지 확인
- 시즌 A 삭제 → 그 경기들의 `seasonId`가 null로 돌아갔는지, 경기 자체는 남아 있는지 확인
- 다른 그룹 계정으로 로그인해 남의 시즌을 지우려 하면 403인지 확인

- [ ] **Step 5: 배포 노트 확인**

이 계획은 커밋만 하고 푸시하지 않는다. 배포할 때는 **반드시** 다음을 지킨다 (설계 8.1):

- **백엔드를 먼저 배포하거나 `workflow_dispatch`로 백엔드·프론트를 동시 배포한다.** 프론트만 먼저 나가면 구버전 백엔드가 `seasonId` 쿼리를 `forbidNonWhitelisted`로 400 거부해 랭킹·선수 상세가 통째로 깨진다.
- CI 헬스체크(`/group/all`)는 이 장애를 잡지 못한다. 배포 후 `/rankings`와 `/player/<id>`를 직접 열어본다.
- `synchronize: true`라 백엔드 재시작 즉시 운영 DB에 컬럼 3개가 추가된다.
- 자유투 수정으로 득점이 약 4% 오른다 — 사용자 문의 가능성을 감안한다.

---

## Self-Review 결과

**Spec 커버리지**

| 설계 절 | 구현 태스크 |
|---|---|
| 1.1 Season 엔티티 | Task 1 |
| 1.2 Group.currentSeasonId | Task 1 |
| 1.3 Game.seasonId | Task 1 |
| 1.4 FK 정책 | Task 1 (컬럼에 FK 미생성) |
| 1.5 인덱스 | Task 1 |
| 1.6 시즌 삭제 정책 | Task 2 |
| 1.7 마이그레이션 부담 | Task 12 Step 5 (배포 노트) |
| 2.1 시즌 CRUD API | Task 3 |
| 2.2 시즌 필터 조회 | Task 6(랭킹), Task 7(ability·team-impact·log/player) |
| 2.3 forbidNonWhitelisted | Task 6 Step 6, Global Constraints |
| 3.2 랭킹 신규 엔드포인트 | Task 5·6 |
| 3.3 고치는 동작 2건 | Task 5(자유투), Task 6(삭제 경기) |
| 3.4 능력치 시즌 필터 | Task 6 Step 5, Task 7 |
| 4.1 seasonStore | Task 8 |
| 4.2 SeasonSelector | Task 9 |
| 4.3 관리 모달 | Task 9 |
| 5 격리·위조 방지 | Task 2(현재 시즌 검증), Task 3(컨트롤러), Task 4(서버가 seasonId 결정) |
| 6 엣지 케이스 | Task 10 Step 2(빈 상태), Task 11 Step 6(스모크) |
| 7 테스트 | Task 1·2·3·4·5·6·7 |
| 8 배포 | Task 12 Step 5 |

**설계 문서와 달라진 점 (계획에서 바로잡음)**

1. **설계 4.4는 TanStack Query 캐시 키를 쓰라고 했지만, `/rankings`와 `/player/[id]`는 TanStack Query를 쓰지 않는다** — 둘 다 `useEffect` + axios 직접 호출이다. 캐시 키 대신 `useEffect` 의존성 배열에 `selection`을 넣는 것으로 대체했다.
2. **설계 2.2에 `GET /log/player/:id`가 누락되어 있었다.** 선수 상세의 경기별 기록 표가 이 API를 쓰므로 Task 7에 포함했다.
3. **설계 3.2의 응답 형태에 `totalScore`/`avgScore`가 빠져 있었다.** 랭킹 페이지의 정렬 로직이 득점 항목에서 이 두 필드를 쓰므로 `RankingPlayer`에 선택 필드로 넣었다 (Task 5).
