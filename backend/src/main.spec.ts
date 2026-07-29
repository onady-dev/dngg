import { spawnSync } from 'child_process';
import * as path from 'path';

// main.ts는 import 즉시 앱을 띄우므로 테스트에서 불러올 수 없다.
// 부팅 가드가 실제로 배선되어 있는지는 프로세스를 직접 띄워야만 알 수 있다 —
// assertMailConfigured 자체에는 단위 테스트가 있지만, main.ts에서 그 줄이
// 지워지면 가드는 조용히 무력화되고 나머지 테스트는 전부 초록으로 남는다.
describe('부팅 가드 배선', () => {
  const backendRoot = path.resolve(__dirname, '..');

  const bootWithoutMailFrom = () => {
    const env = { ...process.env };
    delete env.MAIL_FROM;
    // DB에 절대 닿지 않게 막는다. 가드가 정상이면 NestFactory.create 전에
    // 던지므로 쓰이지 않지만, 가드가 제거된 경우 이 테스트가 실수로 실제
    // DB에 접속하는 일이 없어야 한다.
    env.NODE_ENV = 'prod';
    env.DB_HOST = '127.0.0.1';
    env.DB_PORT = '1';

    return spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register/transpile-only',
        '-r',
        'tsconfig-paths/register',
        'src/main.ts',
      ],
      { cwd: backendRoot, env, encoding: 'utf8' },
    );
  };

  test('운영 환경에서 MAIL_FROM이 없으면 부팅이 중단된다', () => {
    const result = bootWithoutMailFrom();

    // 종료 코드만 검사하면 안 된다 — 가드를 지워도 DB 연결 실패로 1이 되어
    // 테스트가 공허하게 통과한다. 가드의 메시지로 원인을 특정한다.
    expect(`${result.stdout}${result.stderr}`).toContain('MAIL_FROM');
    expect(result.status).toBe(1);
  }, 120000);
});
