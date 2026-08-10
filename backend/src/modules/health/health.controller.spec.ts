import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HealthController } from './health.controller';

function makeController(query: jest.Mock): HealthController {
  return new HealthController({ query } as unknown as DataSource);
}

describe('HealthController', () => {
  test('liveness는 DB를 건드리지 않고 ok를 반환한다', () => {
    const query = jest.fn();
    expect(makeController(query).liveness()).toEqual({ status: 'ok' });
    expect(query).not.toHaveBeenCalled();
  });

  test('readiness는 DB 쿼리가 성공하면 ok를 반환한다', async () => {
    const query = jest.fn().mockResolvedValue([{ result: 1 }]);
    await expect(makeController(query).readiness()).resolves.toEqual({
      status: 'ok',
      db: 'up',
    });
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  // DB가 죽었는데도 200을 뱉는 헬스체크는 없느니만 못하다.
  // 이 테스트가 사라지면 배포 검증이 통째로 무의미해진다.
  test('readiness는 DB 쿼리가 실패하면 503을 던진다', async () => {
    const query = jest.fn().mockRejectedValue(new Error('connection refused'));
    await expect(makeController(query).readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
