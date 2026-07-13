"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import styled, { keyframes } from "styled-components";
import { consumePendingToast, registerToastHandler, ToastType } from "@/lib/toastBus";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 3000;

const slideUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const ToastContainer = styled.div`
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  z-index: 10000;
  width: max-content;
  max-width: calc(100vw - 2rem);
  pointer-events: none;
`;

const ToastBox = styled.div<{ type: ToastType }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  animation: ${slideUp} 0.2s ease-out;
  pointer-events: auto;
  background-color: ${(props) =>
    props.type === "success" ? "#16a34a" : props.type === "error" ? "#dc2626" : "#374151"};
`;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  // React 외부(axios 인터셉터 등)에서도 토스트를 띄울 수 있도록 등록하고,
  // 페이지 리로드 전에 저장된 토스트가 있으면 표시한다.
  useEffect(() => {
    const unregister = registerToastHandler(showToast);
    const pending = consumePendingToast();
    if (pending) {
      showToast(pending.message, pending.type);
    }
    return unregister;
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer aria-live="polite">
        {toasts.map((toast) => (
          <ToastBox key={toast.id} type={toast.type} role="status">
            {toast.message}
          </ToastBox>
        ))}
      </ToastContainer>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast는 ToastProvider 내부에서만 사용할 수 있습니다.");
  }
  return context;
}
