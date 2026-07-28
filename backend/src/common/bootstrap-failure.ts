/**
 * 부팅 실패를 원인 한 줄 + 스택으로 남기고 종료 코드 1로 끝낸다.
 *
 * `bootstrap()`을 catch 없이 두면 Node가 unhandled rejection으로 처리해 스택부터
 * 쏟아내는데, 그러면 `assertMailConfigured` 같은 부팅 가드의 한글 메시지가
 * `docker logs`에서 파묻힌다. 메시지를 먼저 찍어 원인이 첫 줄에 오게 한다.
 *
 * 스택은 버리지 않는다 — 가드가 아닌 부팅 실패(DB 연결 거부, 포트 점유)는
 * 스택이 있어야 진단할 수 있다.
 */
export function reportBootstrapFailure(error: unknown): void {
  if (error instanceof Error) {
    console.error(`부팅 실패: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
  } else {
    console.error(`부팅 실패: ${String(error)}`);
  }
  process.exit(1);
}
