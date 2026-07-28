import { reportBootstrapFailure } from './bootstrap-failure';

describe('reportBootstrapFailure', () => {
  let errorSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const printed = () => errorSpy.mock.calls.map((c) => String(c[0])).join('\n');

  // 부팅 가드(assertMailConfigured)의 한글 메시지가 docker logs에서 묻히지 않아야 한다.
  // unhandled rejection으로 두면 Node가 스택부터 쏟아내 원인 한 줄이 파묻힌다.
  test('에러 메시지를 첫 줄에 출력한다', () => {
    const error = new Error('MAIL_FROM이 설정되지 않았습니다.');
    error.stack = 'Error: MAIL_FROM이 설정되지 않았습니다.\n    at assertMailConfigured (mail.service.ts:1:1)';

    reportBootstrapFailure(error);

    expect(printed().split('\n')[0]).toContain('MAIL_FROM이 설정되지 않았습니다.');
  });

  // 가드 외의 부팅 실패(DB 연결 거부, 포트 점유 등)는 스택이 있어야 진단이 된다.
  test('스택이 있으면 메시지 뒤에 함께 출력한다', () => {
    const error = new Error('connect ECONNREFUSED 127.0.0.1:5432');
    error.stack = 'Error: connect ECONNREFUSED 127.0.0.1:5432\n    at TCPConnectWrap.afterConnect';

    reportBootstrapFailure(error);

    expect(printed()).toContain('at TCPConnectWrap.afterConnect');
  });

  test('Error가 아닌 값도 문자열로 출력한다', () => {
    reportBootstrapFailure('그냥 문자열');

    expect(printed()).toContain('그냥 문자열');
  });

  test('종료 코드 1로 프로세스를 끝낸다', () => {
    reportBootstrapFailure(new Error('boom'));

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
