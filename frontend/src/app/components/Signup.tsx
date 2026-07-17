"use client";

import { useState } from "react";
import { api } from "@/lib/axios";
import { useToast } from "./ui/Toast";
import EmailCodeVerification from "./EmailCodeVerification";
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

export type AuthView = "login" | "signup" | "reset";

const Signup = ({ setView }: { setView: (view: AuthView) => void }) => {
  // 1·2단계(이메일 인증)를 통과하면 verifiedEmail이 채워지고 3단계 폼으로 전환된다
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [groupName, setGroupName] = useState("");
  const { showToast } = useToast();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      showToast("비밀번호가 일치하지 않습니다.", "error");
      return;
    }
    if (password.length < 8) {
      showToast("비밀번호는 8자 이상이어야 합니다.", "error");
      return;
    }
    try {
      await api.post(`/user`, {
        email: verifiedEmail,
        password,
        name,
        groupName,
        verificationToken,
      });
      showToast("회원가입이 완료되었습니다. 로그인해주세요.", "success");
      setView("login");
    } catch (error: any) {
      const message = error?.response?.data?.message;
      showToast(message || "회원가입에 실패했습니다. 잠시 후 다시 시도해주세요.", "error");
    }
  };

  return (
    <AuthContainer>
      <AuthCard>
        <AuthTitle>회원가입</AuthTitle>
        {!verifiedEmail ? (
          <EmailCodeVerification
            purpose="signup"
            submitLabel="인증 확인"
            onVerified={(email, token) => {
              setVerifiedEmail(email);
              setVerificationToken(token);
            }}
          />
        ) : (
          <AuthForm onSubmit={handleSignup}>
            <AuthInput type="email" value={verifiedEmail} disabled />
            <AuthInput
              type="text"
              placeholder="이름 (닉네임)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={30}
            />
            <AuthInput
              type="password"
              placeholder="비밀번호 (8자 이상)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <AuthInput
              type="password"
              placeholder="비밀번호 확인"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <AuthInput
              type="text"
              placeholder="그룹 이름 (모임/팀 이름)"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              required
            />
            <AuthSubmitButton type="submit">회원가입</AuthSubmitButton>
          </AuthForm>
        )}
        <AuthSwitchRow>
          <span>이미 계정이 있으신가요?</span>
          <AuthSwitchButton onClick={() => setView("login")}>로그인</AuthSwitchButton>
        </AuthSwitchRow>
      </AuthCard>
    </AuthContainer>
  );
};

export default Signup;
