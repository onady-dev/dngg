"use client";

import { useState } from "react";
import { api } from "@/lib/axios";
import { useToast } from "./ui/Toast";
import EmailCodeVerification from "./EmailCodeVerification";
import type { AuthView } from "./Signup";
import {
  AuthCard,
  AuthContainer,
  AuthForm,
  AuthInput,
  AuthSubmitButton,
  AuthSwitchButton,
  AuthSwitchRow,
  AuthTitle,
} from "./Login";

const PasswordReset = ({ setView }: { setView: (view: AuthView) => void }) => {
  const [verified, setVerified] = useState(false);
  const [verificationToken, setVerificationToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { showToast } = useToast();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast("비밀번호가 일치하지 않습니다.", "error");
      return;
    }
    if (newPassword.length < 8) {
      showToast("비밀번호는 8자 이상이어야 합니다.", "error");
      return;
    }
    try {
      await api.post(`/user/password-reset`, { verificationToken, newPassword });
      showToast("비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.", "success");
      setView("login");
    } catch (error: any) {
      const message = error?.response?.data?.message;
      showToast(message || "비밀번호 변경에 실패했습니다. 다시 시도해주세요.", "error");
    }
  };

  return (
    <AuthContainer>
      <AuthCard>
        <AuthTitle>비밀번호 재설정</AuthTitle>
        {!verified ? (
          <EmailCodeVerification
            purpose="password_reset"
            submitLabel="인증 확인"
            onVerified={(_email, token) => {
              setVerificationToken(token);
              setVerified(true);
            }}
          />
        ) : (
          <AuthForm onSubmit={handleReset}>
            <AuthInput
              type="password"
              placeholder="새 비밀번호 (8자 이상)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <AuthInput
              type="password"
              placeholder="새 비밀번호 확인"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <AuthSubmitButton type="submit">비밀번호 변경</AuthSubmitButton>
          </AuthForm>
        )}
        <AuthSwitchRow>
          <AuthSwitchButton onClick={() => setView("login")}>
            로그인으로 돌아가기
          </AuthSwitchButton>
        </AuthSwitchRow>
      </AuthCard>
    </AuthContainer>
  );
};

export default PasswordReset;
