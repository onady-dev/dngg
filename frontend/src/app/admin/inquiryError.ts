// 답변 실패를 전부 "메일 발송 실패"로 뭉뚱그리면 잘못된 안내를 하게 된다.
// 404(이미 사라진 문의)나 네트워크 끊김은 메일 발송까지 가지도 못한 경우다.
//
// null을 돌려주면 토스트를 띄우지 않는다 — 401은 axios 인터셉터가 로그아웃 +
// /settings 리다이렉트와 자체 토스트를 이미 처리하므로 여기서 또 알리면 중복이다.
export function inquiryAnswerErrorMessage(error: unknown): string | null {
  const status = (error as { response?: { status?: number } })?.response
    ?.status;

  // 응답 자체가 없으면 네트워크·타임아웃이다. 서버에 닿지 않았으므로
  // 답변은 저장되지 않았고, 그대로 다시 시도하면 된다.
  if (status === undefined) {
    return "서버에 연결하지 못했습니다. 답변은 저장되지 않았습니다.";
  }

  switch (status) {
    case 401:
      return null;
    case 403:
      return "관리자 권한이 없습니다.";
    case 404:
      return "이미 삭제된 문의입니다. 목록을 새로고침했습니다.";
    case 400:
      return "답변 내용이 올바르지 않습니다. (1~5000자)";
    default:
      // 답변 저장과 메일 발송이 한 트랜잭션이라 실패 시 롤백된다 —
      // 상태가 pending으로 남는다는 것은 백엔드가 보장하는 불변식이다.
      return "답변 메일 발송에 실패했습니다. 문의는 미답변으로 남아 있습니다.";
  }
}
