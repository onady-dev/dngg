import {
  DEFAULT_DB_POOL_MAX,
  DB_CONNECTION_TIMEOUT_MS,
  buildTypeOrmOptions,
} from './typeorm.options';

const baseEnv = {
  DB_HOST: 'db',
  DB_PORT: '5432',
  DB_USERNAME: 'postgres',
  DB_PASSWORD: 'pw',
  DB_DATABASE: 'dngg',
} as NodeJS.ProcessEnv;

// extra는 TypeORM 타입상 any라 테스트에서 좁혀 쓴다.
function poolOf(env: NodeJS.ProcessEnv): { max: number; connectionTimeoutMillis: number } {
  return buildTypeOrmOptions(env).extra as { max: number; connectionTimeoutMillis: number };
}

describe('buildTypeOrmOptions', () => {
  test('커넥션 풀 상한과 획득 타임아웃을 명시한다', () => {
    expect(poolOf(baseEnv)).toEqual({
      max: DEFAULT_DB_POOL_MAX,
      connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
    });
  });

  test('DB_POOL_MAX로 풀 상한을 조정할 수 있다 (L1 확장 시 20으로 올린다)', () => {
    expect(poolOf({ ...baseEnv, DB_POOL_MAX: '20' }).max).toBe(20);
  });

  test('잘못된 DB_POOL_MAX는 기본값으로 폴백해 부팅을 막지 않는다', () => {
    expect(poolOf({ ...baseEnv, DB_POOL_MAX: 'abc' }).max).toBe(DEFAULT_DB_POOL_MAX);
  });

  // synchronize를 끄면 운영 스키마가 갱신되지 않아 조용히 깨진다.
  // 이 저장소는 아직 synchronize에 의존하므로 값이 바뀌면 테스트가 잡아야 한다.
  test('기존 동작(synchronize: true)을 유지한다', () => {
    const options = buildTypeOrmOptions(baseEnv) as { synchronize: boolean; type: string };
    expect(options.synchronize).toBe(true);
    expect(options.type).toBe('postgres');
  });

  test('DB_PORT를 숫자로 변환한다', () => {
    const options = buildTypeOrmOptions(baseEnv) as { port: number };
    expect(options.port).toBe(5432);
  });
});
