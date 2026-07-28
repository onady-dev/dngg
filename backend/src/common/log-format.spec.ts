import { formatLogLine } from './log-format';

const base = {
  timestamp: '2026-07-29 10:00:00.000',
  level: 'error',
};

describe('formatLogLine', () => {
  test('타임스탬프·레벨·메시지를 한 줄로 만든다', () => {
    expect(formatLogLine({ ...base, message: '뭔가 실패' })).toBe(
      '2026-07-29 10:00:00.000 [error] 뭔가 실패',
    );
  });

  test('context가 있으면 대괄호로 붙인다', () => {
    expect(
      formatLogLine({ ...base, message: '실패', context: 'InquiryService' }),
    ).toBe('2026-07-29 10:00:00.000 [error] [InquiryService] 실패');
  });

  test('객체 메시지는 JSON으로 펼친다', () => {
    expect(formatLogLine({ ...base, message: { a: 1 } })).toBe(
      `2026-07-29 10:00:00.000 [error] ${JSON.stringify({ a: 1 }, null, 2)}`,
    );
  });

  // 이 프로젝트의 실제 회귀: nest-winston의 WinstonLogger.error는 2번째 인자(trace)를
  // 메타 `stack`에 **배열로** 담아 넘긴다(winston.classes.js). `trace`를 읽으면 스택이 통째로 유실된다.
  test('nest-winston이 배열로 넘긴 stack을 다음 줄에 출력한다', () => {
    expect(
      formatLogLine({
        ...base,
        message: '메일 발송 실패',
        stack: ['Error: boom\n    at foo (bar.ts:1:1)'],
      }),
    ).toBe(
      '2026-07-29 10:00:00.000 [error] 메일 발송 실패\nError: boom\n    at foo (bar.ts:1:1)',
    );
  });

  test('문자열로 온 stack도 그대로 출력한다', () => {
    expect(
      formatLogLine({ ...base, message: '실패', stack: 'Error: boom' }),
    ).toBe('2026-07-29 10:00:00.000 [error] 실패\nError: boom');
  });

  // Logger.error(msg)처럼 trace 없이 호출하면 nest-winston이 stack: [undefined]를 넘긴다.
  // 빈 배열이 아니라 truthy한 배열이므로 그냥 렌더하면 "undefined"가 찍힌다.
  test('stack이 [undefined]면 아무것도 덧붙이지 않는다', () => {
    expect(
      formatLogLine({ ...base, message: '실패', stack: [undefined] }),
    ).toBe('2026-07-29 10:00:00.000 [error] 실패');
  });

  test('stack이 빈 문자열이거나 없으면 아무것도 덧붙이지 않는다', () => {
    expect(formatLogLine({ ...base, message: '실패', stack: [''] })).toBe(
      '2026-07-29 10:00:00.000 [error] 실패',
    );
    expect(formatLogLine({ ...base, message: '실패', stack: [] })).toBe(
      '2026-07-29 10:00:00.000 [error] 실패',
    );
  });

  // 호출부가 실수로 구조화 메타를 2번째 인자에 넘기면 stack에 객체가 들어온다.
  // 그 객체에는 요청 body(가입·로그인 평문 비밀번호)가 들어있을 수 있으므로 절대 덤프하지 않는다.
  test('stack에 객체가 들어오면 덤프하지 않는다', () => {
    const line = formatLogLine({
      ...base,
      message: '실패',
      stack: [{ body: { password: 'hunter2' } }],
    });
    expect(line).toBe('2026-07-29 10:00:00.000 [error] 실패');
    expect(line).not.toContain('hunter2');
    expect(line).not.toContain('[object Object]');
  });

  test('context가 문자열이 아니면 [object Object]를 찍지 않는다', () => {
    expect(
      formatLogLine({ ...base, message: '실패', context: { url: '/user' } }),
    ).toBe('2026-07-29 10:00:00.000 [error] 실패');
  });
});
