import * as fs from 'fs';
import * as path from 'path';
import { AppDataSource } from './data-source';

// data-source.ts는 migration:generate / migration:run이 쓰는 유일한 설정이다.
// 여기 빠진 엔티티는 마이그레이션 생성 시 "DB에는 있는데 코드에는 없는 테이블"로
// 보여 `DROP TABLE`이 생성된다. app.module.ts는 autoLoadEntities라 앱은 멀쩡히
// 돌기 때문에 이 누락은 synchronize: false로 전환하는 순간까지 드러나지 않는다.
describe('AppDataSource', () => {
  const entityDir = path.join(__dirname, 'entities');

  const fileEntityNames = fs
    .readdirSync(entityDir)
    .filter((file) => file.endsWith('.entity.ts'))
    .map((file) => file.replace('.entity.ts', ''))
    .sort();

  const registeredNames = (AppDataSource.options.entities as { name: string }[])
    .map((entity) => entity.name)
    .sort();

  test('엔티티 디렉토리의 모든 엔티티가 등록되어 있다', () => {
    expect(registeredNames).toEqual(fileEntityNames);
  });

  test('엔티티 디렉토리가 비어 있지 않다 (위 비교가 공허하게 통과하지 않도록)', () => {
    expect(fileEntityNames.length).toBeGreaterThan(10);
  });

  // 마이그레이션도 같은 방식으로 드리프트한다 — 파일을 추가하고 등록을 잊으면
  // migration:run이 그 마이그레이션을 조용히 건너뛴다.
  test('마이그레이션 디렉토리의 모든 마이그레이션이 등록되어 있다', () => {
    const fileCount = fs
      .readdirSync(path.join(__dirname, 'migrations'))
      .filter((file) => file.endsWith('.ts')).length;

    expect(AppDataSource.options.migrations).toHaveLength(fileCount);
  });

  // synchronize: true는 app.module.ts 쪽 이야기다. 마이그레이션 도구가 쓰는
  // 이 설정까지 true가 되면 migration:run이 스키마를 제멋대로 바꾼다.
  test('synchronize는 꺼져 있다', () => {
    expect(AppDataSource.options.synchronize).toBe(false);
  });
});
