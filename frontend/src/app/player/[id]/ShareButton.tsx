"use client";

import React, { useState } from "react";
import { track } from "@/lib/analytics";
import { showGlobalToast } from "@/lib/toastBus";
import * as S from "./styles/PlayerDetailStyles";

interface ShareButtonProps {
  playerId: number;
}

export default function ShareButton({ playerId }: ShareButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // 링크만 공유한다(메시지 텍스트 없음). 받는 앱(카톡/밴드 등)이 이 페이지의
      // og:image(능력치 카드)를 썸네일 미리보기로 자동 표시한다.
      const url = `${window.location.origin}/player/${playerId}?utm_source=share&utm_medium=link&utm_campaign=ability`;

      if (navigator.share) {
        await navigator.share({ url });
        track("share_click", { playerId, method: "web_share_link" });
        return;
      }

      // 폴백: 링크를 클립보드에 복사
      await navigator.clipboard.writeText(url);
      showGlobalToast("링크를 복사했어요. 붙여넣으면 카드 미리보기가 떠요.", "success");
      track("share_click", { playerId, method: "copy_link" });
    } catch (e) {
      // 사용자가 공유 시트를 취소하면 AbortError → 조용히 무시
      if ((e as { name?: string })?.name !== "AbortError") {
        showGlobalToast("공유에 실패했어요. 잠시 후 다시 시도해주세요.", "error");
        track("share_click", { playerId, method: "error" });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <S.ShareButton onClick={handleShare} disabled={busy} aria-label="능력치 링크 공유">
      {busy ? "준비 중…" : "🔗 능력치 공유"}
    </S.ShareButton>
  );
}
