"use client";

import { useState } from "react";
import { api } from "@/lib/axios";
import { useToast } from "./ui/Toast";
// [임시] AWS SES 승인 지연으로 이메일 인증 단계를 우회한다.
// 승인 후 아래 import와 인증 게이트(JSX)를 복구하고, 이메일 직접 입력을 되돌릴 것.
// import EmailCodeVerification from "./EmailCodeVerification";
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
  // [임시] 이메일 인증 우회 — 인증 없이 email을 직접 입력받는다.
  // 복구 시 아래 verifiedEmail/verificationToken 상태와 EmailCodeVerification 게이트를 되살릴 것.
  // const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  // const [verificationToken, setVerificationToken] = useState("");
  const [email, setEmail] = useState("");
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
        email,
        password,
        name,
        groupName,
        // [임시] 이메일 인증 우회 — 복구 시 verificationToken 재전송할 것
        // verificationToken,
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
        {/* [임시] AWS SES 승인 지연으로 이메일 인증(EmailCodeVerification) 게이트를 제거하고
            이메일을 직접 입력받는 단일 폼으로 대체했다. 승인 후 인증 게이트를 복구할 것(git 이력 참조). */}
        <AuthForm onSubmit={handleSignup}>
          <AuthInput
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
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
        <AuthSwitchRow>
          <span>이미 계정이 있으신가요?</span>
          <AuthSwitchButton onClick={() => setView("login")}>로그인</AuthSwitchButton>
        </AuthSwitchRow>
      </AuthCard>
    </AuthContainer>
  );
};

export default Signup;
