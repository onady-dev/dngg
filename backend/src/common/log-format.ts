/**
 * Winston 콘솔 transport의 printf 포매터.
 *
 * 스택을 `stack`에서 읽는 이유: nest-winston의 `WinstonLogger.error(message, trace)`는
 * 2번째 인자를 메타 `stack`에 **배열로** 담아 넘긴다(`stack: [trace || error.stack]`).
 * 예전 구현은 `trace`를 읽어서 프로젝트 전체의 `Logger.error` 스택이 조용히 유실됐다.
 *
 * 문자열이 아닌 stack 항목은 의도적으로 버린다. 호출부가 실수로 구조화 메타를 2번째
 * 인자에 넘기면 여기로 객체가 들어오는데, 그 안에 요청 body(평문 비밀번호)가 있을 수 있다.
 * context도 같은 이유로 문자열만 렌더한다.
 */
export function formatLogLine(info: Record<string, any>): string {
  const { timestamp, level, message, context, stack } = info;

  const messageStr: string =
    typeof message === 'object' && message !== null
      ? JSON.stringify(message, null, 2)
      : String(message);
  const contextStr =
    typeof context === 'string' && context ? `[${context}] ` : '';

  const traces = (Array.isArray(stack) ? stack : [stack]).filter(
    (entry): entry is string => typeof entry === 'string' && entry.length > 0,
  );
  const traceStr = traces.length > 0 ? `\n${traces.join('\n')}` : '';

  return `${timestamp} [${level}] ${contextStr}${messageStr}${traceStr}`;
}
