import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './httpExceptionFilter';

function makeHost(request: any) {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

const request = {
  method: 'POST',
  originalUrl: '/user',
  body: { email: 'a@b.com', password: 'hunter2' },
  headers: { 'user-agent': 'jest' },
};

describe('HttpExceptionFilter', () => {
  let logger: { error: jest.Mock; warn: jest.Mock; log: jest.Mock };
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
    filter = new HttpExceptionFilter(logger as any);
  });

  // nest-winston은 2번째 인자만 메타 `stack`으로 실어 보낸다. 구조화 객체를 여기 넘기면
  // 스택이 유실되고, 그 객체에 담긴 요청 body(평문 비밀번호)가 로그로 샐 위험도 생긴다.
  test('500 로그의 2번째 인자로 예외 스택 문자열을 넘긴다', () => {
    const { host } = makeHost(request);
    const exception = new Error('boom');

    filter.catch(exception, host);

    const [, trace] = logger.error.mock.calls[0];
    expect(trace).toBe(exception.stack);
  });

  test('500 로그의 3번째 인자(context)는 문자열이다', () => {
    const { host } = makeHost(request);

    filter.catch(new Error('boom'), host);

    const [, , context] = logger.error.mock.calls[0];
    expect(typeof context).toBe('string');
  });

  test('4xx 로그의 2번째 인자(context)는 문자열이다', () => {
    const { host } = makeHost(request);

    filter.catch(
      new HttpException('잘못된 요청', HttpStatus.BAD_REQUEST),
      host,
    );

    const [, context] = logger.warn.mock.calls[0];
    expect(typeof context).toBe('string');
  });

  test('어떤 로그 인자에도 요청 body를 싣지 않는다', () => {
    const { host } = makeHost(request);

    filter.catch(new Error('boom'), host);
    filter.catch(
      new HttpException('잘못된 요청', HttpStatus.BAD_REQUEST),
      host,
    );

    const logged = JSON.stringify([
      ...logger.error.mock.calls,
      ...logger.warn.mock.calls,
    ]);
    expect(logged).not.toContain('hunter2');
  });

  test('예외가 Error가 아니면 스택 자리에 undefined를 넘긴다', () => {
    const { host } = makeHost(request);

    filter.catch('그냥 문자열', host);

    const [, trace] = logger.error.mock.calls[0];
    expect(trace).toBeUndefined();
  });

  test('루트 경로의 4xx는 로깅하지 않는다', () => {
    const { host } = makeHost({ ...request, originalUrl: '/' });

    filter.catch(new HttpException('없음', HttpStatus.NOT_FOUND), host);

    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('상태 코드와 응답 본문은 그대로 내려준다', () => {
    const { host, response } = makeHost(request);

    filter.catch(
      new HttpException('잘못된 요청', HttpStatus.BAD_REQUEST),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith({ message: '잘못된 요청' });
  });
});
