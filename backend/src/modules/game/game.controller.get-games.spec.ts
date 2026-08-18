import { BadRequestException } from '@nestjs/common';
import { GameController } from './game.controller';

// GET /game은 DTO 없이 원시 @Query 파라미터를 쓰기 때문에 전역
// ValidationPipe가 관여하지 않는다. assertValidDateRange가 서비스 호출보다
// 먼저 실행되는지, 검증 실패 시 서비스가 아예 불리지 않는지를 배선
// 수준에서 고정한다 (game.controller.season.spec.ts 패턴을 따름).
const createController = () => {
  const service = {
    getGames: jest.fn().mockResolvedValue({ games: [], hasMore: false }),
  };
  const controller = new GameController(service as any);
  return { controller, service };
};

describe('GameController.getGameByGroupId 날짜 검증 배선', () => {
  test('from 형식이 틀리면 BadRequestException을 던지고 서비스를 호출하지 않는다', async () => {
    const { controller, service } = createController();

    await expect(
      controller.getGameByGroupId(
        1 as any,
        undefined,
        undefined,
        undefined,
        'abc',
        undefined,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(service.getGames).not.toHaveBeenCalled();
  });

  test('from > to면 BadRequestException을 던지고 서비스를 호출하지 않는다', async () => {
    const { controller, service } = createController();

    await expect(
      controller.getGameByGroupId(
        1 as any,
        undefined,
        undefined,
        undefined,
        '2026-12-31',
        '2026-01-01',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(service.getGames).not.toHaveBeenCalled();
  });

  test('실재하지 않는 날짜(2026-02-30)면 BadRequestException을 던지고 서비스를 호출하지 않는다', async () => {
    const { controller, service } = createController();

    await expect(
      controller.getGameByGroupId(
        1 as any,
        undefined,
        undefined,
        undefined,
        '2026-02-30',
        undefined,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(service.getGames).not.toHaveBeenCalled();
  });

  test('정상 범위면 검증을 통과하고 서비스가 from/to를 포함한 옵션으로 호출된다', async () => {
    const { controller, service } = createController();

    await controller.getGameByGroupId(
      1 as any,
      '2',
      '10',
      'FINISHED',
      '2026-01-01',
      '2026-12-31',
    );

    expect(service.getGames).toHaveBeenCalledWith(1, {
      page: 2,
      limit: 10,
      status: 'FINISHED',
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });

  test('from/to 없이 호출해도 검증을 통과하고 서비스가 undefined로 호출된다', async () => {
    const { controller, service } = createController();

    await controller.getGameByGroupId(
      1 as any,
      undefined,
      undefined,
      undefined,
    );

    expect(service.getGames).toHaveBeenCalledWith(1, {
      page: undefined,
      limit: undefined,
      status: undefined,
      from: undefined,
      to: undefined,
    });
  });
});
