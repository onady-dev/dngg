export type ToastType = "success" | "error" | "info";

type ToastHandler = (message: string, type?: ToastType) => void;

const PENDING_TOAST_KEY = "pendingToast";

let handler: ToastHandler | null = null;

// ToastProvider가 마운트될 때 자신의 showToast를 등록한다.
export function registerToastHandler(fn: ToastHandler): () => void {
  handler = fn;
  return () => {
    if (handler === fn) {
      handler = null;
    }
  };
}

// React 외부(axios 인터셉터 등)에서 토스트를 표시한다.
export function showGlobalToast(message: string, type: ToastType = "info"): void {
  if (handler) {
    handler(message, type);
  }
}

// 페이지 이동(전체 리로드) 후에도 토스트가 보이도록 임시 저장한다.
export function setPendingToast(message: string, type: ToastType = "info"): void {
  try {
    sessionStorage.setItem(PENDING_TOAST_KEY, JSON.stringify({ message, type }));
  } catch {
    // 저장 불가 환경에서는 토스트를 생략한다.
  }
}

export function consumePendingToast(): { message: string; type: ToastType } | null {
  try {
    const raw = sessionStorage.getItem(PENDING_TOAST_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_TOAST_KEY);
    const parsed = JSON.parse(raw);
    if (typeof parsed?.message !== "string") return null;
    const type: ToastType =
      parsed.type === "success" || parsed.type === "error" ? parsed.type : "info";
    return { message: parsed.message, type };
  } catch {
    return null;
  }
}
