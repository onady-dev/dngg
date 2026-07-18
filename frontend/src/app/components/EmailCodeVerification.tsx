"use client";

import { useEffect, useState } from "react";
import styled from "styled-components";
import api from "@/lib/axios";
import { useToast } from "./ui/Toast";
import { AuthForm, AuthInput, AuthSubmitButton } from "./Login";

const CodeRow = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
`;

const TimerText = styled.span`
  font-size: 0.8125rem;
  color: #6b7280;
  min-width: 3.5rem;
  text-align: right;
`;

const ResendButton = styled.button`
  font-size: 0.8125rem;
  color: var(--primary-color);
  font-weight: 600;
  white-space: nowrap;

  &:disabled {
    color: #9ca3af;
    cursor: not-allowed;
  }
`;

export type VerificationPurpose = "signup" | "password_reset";

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const EmailCodeVerification = ({
  purpose,
  submitLabel,
  onVerified,
}: {
  purpose: VerificationPurpose;
  submitLabel: string;
  onVerified: (email: string, verificationToken: string) => void;
}) => {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0); // 코드 만료(10분)
  const [resendCooldown, setResendCooldown] = useState(0); // 재발송 쿨다운(60초)
  const [isBusy, setIsBusy] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!codeSent) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      setResendCooldown((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [codeSent]);

  const requestCode = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await api.post("/user/email-verification/request", { email, purpose });
      setCodeSent(true);
      setCode("");
      setSecondsLeft(600);
      setResendCooldown(60);
      showToast("인증 코드를 발송했습니다. 메일함을 확인해주세요.", "success");
    } catch (error: any) {
      const message = error?.response?.data?.message;
      showToast(message || "인증 코드 발송에 실패했습니다.", "error");
    } finally {
      setIsBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeSent) {
      await requestCode();
      return;
    }
    if (isBusy) return;
    setIsBusy(true);
    try {
      const response = await api.post("/user/email-verification/confirm", {
        email,
        code,
        purpose,
      });
      onVerified(email, response.data.verificationToken);
    } catch (error: any) {
      const message = error?.response?.data?.message;
      showToast(message || "인증에 실패했습니다.", "error");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <AuthForm onSubmit={handleSubmit}>
      <AuthInput
        type="email"
        placeholder="이메일"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        disabled={codeSent}
        autoComplete="email"
      />
      {codeSent && (
        <CodeRow>
          <AuthInput
            type="text"
            inputMode="numeric"
            placeholder="인증 코드 6자리"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            required
            style={{ flex: 1 }}
          />
          <TimerText>{formatTime(secondsLeft)}</TimerText>
          <ResendButton
            type="button"
            onClick={requestCode}
            disabled={resendCooldown > 0 || isBusy}
          >
            {resendCooldown > 0 ? `재발송 (${resendCooldown}s)` : "재발송"}
          </ResendButton>
        </CodeRow>
      )}
      <AuthSubmitButton type="submit" disabled={isBusy}>
        {codeSent ? submitLabel : "인증코드 발송"}
      </AuthSubmitButton>
    </AuthForm>
  );
};

export default EmailCodeVerification;
