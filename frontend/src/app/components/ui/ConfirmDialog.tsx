"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import styled from "styled-components";

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9000;
  padding: 1rem;
`;

const DialogBox = styled.div`
  background: white;
  border-radius: 0.75rem;
  padding: 1.5rem;
  width: 100%;
  max-width: 360px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
`;

const DialogTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 0.5rem;
`;

const DialogMessage = styled.p`
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 1.25rem;
  line-height: 1.5;
  white-space: pre-line;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
`;

const CancelButton = styled.button`
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  background-color: #f3f4f6;
  color: var(--text-color);

  &:hover {
    background-color: #e5e7eb;
  }
`;

const ConfirmButton = styled.button<{ danger?: boolean }>`
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: white;
  background-color: ${(props) => (props.danger ? "#dc2626" : "var(--primary-color)")};

  &:hover {
    background-color: ${(props) => (props.danger ? "#b91c1c" : "var(--hover-color)")};
  }
`;

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (result: boolean) => void;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setPending({ options, resolve });
    });
  }, []);

  const close = useCallback(
    (result: boolean) => {
      if (!pending) return;
      pending.resolve(result);
      setPending(null);
    },
    [pending]
  );

  useEffect(() => {
    if (!pending) return;
    confirmButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [pending, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <Overlay onClick={() => close(false)}>
          <DialogBox
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <DialogTitle id="confirm-dialog-title">{pending.options.title}</DialogTitle>
            {pending.options.message && <DialogMessage>{pending.options.message}</DialogMessage>}
            <ButtonRow>
              <CancelButton onClick={() => close(false)}>
                {pending.options.cancelText ?? "취소"}
              </CancelButton>
              <ConfirmButton
                ref={confirmButtonRef}
                danger={pending.options.danger}
                onClick={() => close(true)}
              >
                {pending.options.confirmText ?? "확인"}
              </ConfirmButton>
            </ButtonRow>
          </DialogBox>
        </Overlay>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm은 ConfirmProvider 내부에서만 사용할 수 있습니다.");
  }
  return context;
}
