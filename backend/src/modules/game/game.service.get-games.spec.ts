import { GameService } from './game.service';

// getGames 응답 매핑만 검증한다. game.service.season.spec.ts /
// game.service.gating.spec.ts와 같은 목 구성 패턴(생성자 4개 인자를
// 최소 스텁으로 채움)을 따른다.
const GROUP_ID = 1;

const makeGame = (overrides: any = {}) => ({
  id: 100,
  date: '2026-05-01',
  homeTeamName: 'home',
  awayTeamName: 'away',
  status: 'FINISHED',
  seasonId: null,
  ...overrides,
});

const createService = (opts: { games: any[] }) => {
  const findByGroupId = jest.fn().mockResolvedValue(opts.games);
  const gameRepository = { findByGroupId };
  const findPlayers = jest.fn().mockResolvedValue([]);
  const inGamePlayersRepository = { findPlayers };
  const findLogsByGameId = jest.fn().mockResolvedValue([]);
  const logRepository = { findLogsByGameId };
  const dataSource = {};
  const service = new GameService(
    gameRepository as any,
    inGamePlayersRepository as any,
    logRepository as any,
    dataSource as any,
  );
  return { service, findByGroupId, findPlayers, findLogsByGameId };
};

describe('GameService.getGames 응답 매핑', () => {
  test('리포지토리가 준 seasonId가 응답에 그대로 실린다', async () => {
    const { service } = createService({
      games: [makeGame({ id: 1, seasonId: 42 })],
    });

    const result = await service.getGames(GROUP_ID);

    expect(result.games).toHaveLength(1);
    expect(result.games[0].seasonId).toBe(42);
  });

  test('seasonId가 null이면 응답도 null이다', async () => {
    const { service } = createService({
      games: [makeGame({ id: 1, seasonId: null })],
    });

    const result = await service.getGames(GROUP_ID);

    expect(result.games[0].seasonId).toBeNull();
  });

  test('seasonId가 undefined이면 ?? null로 응답에서 null이 된다', async () => {
    const { service } = createService({
      games: [makeGame({ id: 1, seasonId: undefined })],
    });

    const result = await service.getGames(GROUP_ID);

    expect(result.games[0].seasonId).toBeNull();
  });

  test('경기마다 다른 seasonId가 각각 정확히 매핑된다', async () => {
    const { service } = createService({
      games: [
        makeGame({ id: 1, seasonId: 7 }),
        makeGame({ id: 2, seasonId: null }),
        makeGame({ id: 3, seasonId: 9 }),
      ],
    });

    const result = await service.getGames(GROUP_ID);

    expect(result.games.map((g: any) => g.seasonId)).toEqual([7, null, 9]);
  });

  test('options(from/to 포함)가 gameRepository.findByGroupId에 그대로 전달된다', async () => {
    const { service, findByGroupId } = createService({ games: [] });
    const options = {
      page: 2,
      limit: 10,
      status: 'FINISHED',
      from: '2026-01-01',
      to: '2026-12-31',
    };

    await service.getGames(GROUP_ID, options);

    expect(findByGroupId).toHaveBeenCalledWith(GROUP_ID, options);
  });

  test('options 없이 호출해도 findByGroupId가 groupId와 undefined로 호출된다', async () => {
    const { service, findByGroupId } = createService({ games: [] });

    await service.getGames(GROUP_ID);

    expect(findByGroupId).toHaveBeenCalledWith(GROUP_ID, undefined);
  });

  test('from/to만 있는 옵션도 그대로 전달된다 (날짜 필터가 조용히 사라지지 않는다)', async () => {
    const { service, findByGroupId } = createService({ games: [] });
    const options = { from: '2026-01-01', to: '2026-06-30' };

    await service.getGames(GROUP_ID, options);

    const [, passedOptions] = findByGroupId.mock.calls[0];
    expect(passedOptions.from).toBe('2026-01-01');
    expect(passedOptions.to).toBe('2026-06-30');
  });
});
