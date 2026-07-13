"use client";

import { useState } from "react";
import { api } from "@/lib/axios";
import { useToast } from "./ui/Toast";
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

const Signup = ({ setIsSignup }: { setIsSignup: (isLogin: boolean) => void }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [groupName, setGroupName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { showToast } = useToast();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      showToast("비밀번호가 일치하지 않습니다.", "error");
      return;
    }
    try {
      await api.post(`/user`, { email, password, phoneNumber, groupName });
      showToast("회원가입이 완료되었습니다. 로그인해주세요.", "success");
      setIsSignup(false);
    } catch (error: any) {
      const message = error?.response?.data?.message;
      showToast(message || "회원가입에 실패했습니다. 잠시 후 다시 시도해주세요.", "error");
    }
  };

  return (
    <AuthContainer>
      <AuthCard>
        <AuthTitle>회원가입</AuthTitle>
        <AuthForm onSubmit={handleSignup}>
          <AuthInput
            type="text"
            placeholder="아이디"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
          <AuthInput
            type="password"
            placeholder="비밀번호"
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
          <AuthInput
            type="text"
            placeholder="전화번호 (선택)"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
          />
          <AuthSubmitButton type="submit">회원가입</AuthSubmitButton>
        </AuthForm>
        <AuthSwitchRow>
          <span>이미 계정이 있으신가요?</span>
          <AuthSwitchButton onClick={() => setIsSignup(false)}>로그인</AuthSwitchButton>
        </AuthSwitchRow>
      </AuthCard>
    </AuthContainer>
  );
};

export default Signup;
