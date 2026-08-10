import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { readPositiveInt } from '../common/env';

// node-postgres 기본 풀 상한과 같은 값이지만, 우연이 아니라 의도임을 명시한다.
export const DEFAULT_DB_POOL_MAX = 10;

// 스파이크 때 커넥션 획득 대기가 무한정 쌓이지 않고 빠르게 실패하게 한다.
export const DB_CONNECTION_TIMEOUT_MS = 5000;

export function buildTypeOrmOptions(
  env: NodeJS.ProcessEnv,
): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE,
    entities: ['dist/entities/*.entity.js'],
    autoLoadEntities: true,
    synchronize: true,
    logging: false,
    extra: {
      max: readPositiveInt(env.DB_POOL_MAX, DEFAULT_DB_POOL_MAX),
      connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
    },
  };
}
