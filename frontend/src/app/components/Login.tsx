"use client";

import { useState } from "react";
import styled from "styled-components";
import { useAuthStore } from "../stores/useAuthStore";
import api from "@/lib/axios";
import { useToast } from "./ui/Toast";

export const AuthContainer = styled.div`
  min-height: calc(100vh - 60px);
  display: flex;
  justify-content: center;
  align-items: center;
  background: #f9f9f9;
  padding: 1rem;
`;

export const AuthCard = styled.div`
  background: #fff;
  padding: 2rem;
  border-radius: 0.75rem;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.08);
  width: 100%;
  max-width: 360px;
`;

export const AuthTitle = styled.h2`
  margin-bottom: 1.5rem;
  text-align: center;
  font-size: 1.375rem;
  font-weight: 700;
`;

export const AuthForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

export const AuthInput = styled.input`
  padding: 0.625rem;
  border-radius: 0.375rem;
  border: 1px solid #ddd;
  font-size: 1rem;

  &:focus {
    outline: none;
    border-color: var(--primary-color);
  }
`;

export const AuthSubmitButton = styled.button`
  padding: 0.625rem;
  border-radius: 0.375rem;
  background: var(--primary-color);
  color: #fff;
  font-weight: 600;
  font-size: 1rem;

  &:hover {
    background: var(--hover-color);
  }
`;

export const AuthSwitchRow = styled.div`
  margin-top: 1rem;
  text-align: center;
  font-size: 0.875rem;
  color: #6b7280;
`;

export const AuthSwitchButton = styled.button`
  margin-left: 0.5rem;
  color: var(--primary-color);
  font-weight: 600;
  font-size: 0.875rem;
`;

const Login = ({ setIsSignup }: { setIsSignup: (isLogin: boolean) => void }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const setUser = useAuthStore((state) => state.setUser);
  const { showToast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await api.post(`/user/login`, { email, password });
      setUser({
        id: response.data.user.id,
        email: response.data.user.email,
        groupId: response.data.user.groupId,
        accessToken: response.data.accessToken,
      });
      showToast("로그인되었습니다.", "success");
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401) {
        showToast("아이디 또는 비밀번호가 올바르지 않습니다.", "error");
      } else if (status === 404) {
        showToast("존재하지 않는 사용자입니다.", "error");
      } else {
        showToast("로그인에 실패했습니다. 잠시 후 다시 시도해주세요.", "error");
      }
    }
  };

  return (
    <AuthContainer>
      <AuthCard>
        <AuthTitle>로그인</AuthTitle>
        <AuthForm onSubmit={handleLogin}>
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
            autoComplete="current-password"
          />
          <AuthSubmitButton type="submit">로그인</AuthSubmitButton>
        </AuthForm>
        <AuthSwitchRow>
          <span>계정이 없으신가요?</span>
          <AuthSwitchButton onClick={() => setIsSignup(true)}>회원가입</AuthSwitchButton>
        </AuthSwitchRow>
      </AuthCard>
    </AuthContainer>
  );
};

export default Login;
