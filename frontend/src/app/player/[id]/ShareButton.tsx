"use client";

import React, { useState } from "react";
import { track } from "@/lib/analytics";
import { showGlobalToast } from "@/lib/toastBus";
import * as S from "./styles/PlayerDetailStyles";

interface ShareButtonProps {
  playerId: number;
  playerName: string;
}

export default function ShareButton({ playerId, playerName }: ShareButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // 공유 카드 이미지(OG 라우트)와 UTM 딥링크를 준비한다.
      const res = await fetch(`/player/${playerId}/opengraph-image`);
      const blob = await res.blob();
      const file = new File([blob], `dngg-player-${playerId}.png`, { type: "image/png" });
      const url = `${window.location.origin}/player/${playerId}?utm_source=share&utm_medium=card&utm_campaign=ability`;
      const text = `${playerName} 능력치 · dn.gg`;
      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
      };

      // 1) 파일 공유 지원(주로 모바일): 이미지 + 링크
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], text, url });
        track("share_click", { playerId, method: "web_share_file" });
        return;
      }
      // 2) 링크 공유만 지원
      if (nav.share) {
        await nav.share({ text, url });
        track("share_click", { playerId, method: "web_share_link" });
        return;
      }
      // 3) 폴백: 이미지 다운로드 + 링크 복사(데스크톱 등)
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `dngg-player-${playerId}.png`;
      a.click();
      URL.revokeObjectURL(objectUrl);
      try {
        await navigator.clipboard?.writeText(url);
        showGlobalToast("카드를 저장했어요. 링크도 복사됐어요.", "success");
      } catch {
        showGlobalToast("카드를 저장했어요.", "success");
      }
      track("share_click", { playerId, method: "download" });
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
    <S.ShareButton onClick={handleShare} disabled={busy} aria-label="능력치 카드 공유">
      {busy ? "준비 중…" : "🔗 능력치 카드 공유"}
    </S.ShareButton>
  );
}
