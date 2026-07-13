"use client";

import { useEffect, useState } from "react";

// localStorage 기반 상태(selectedGroup 등)로 분기하는 화면에서
// SSR 마크업과 클라이언트 첫 렌더가 달라지는 hydration 오류를 막기 위한 가드.
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}
