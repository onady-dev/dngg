"use client";

import { useState } from "react";
import styled from "styled-components";
import { useAuthStore } from "../stores/useAuthStore";
import { useGroupStore } from "../stores/groupStore";
import api from "@/lib/axios";
import { useToast } from "./ui/Toast";
import type { AuthView } from "./Signup";

export const AuthContainer = styled.div`
  min-height: calc(100vh - var(--header-height));
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

const Login = ({ setView }: { setView: (view: AuthView) => void }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const setUser = useAuthStore((state) => state.setUser);
  const setSelectedGroup = useGroupStore((state) => state.setSelectedGroup);
  const { showToast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await api.post(`/user/login`, { email, password });
      // axios 인터셉터가 localStorage.token을 읽어 Authorization을 붙이므로 로그인 시 저장한다.
      localStorage.setItem("token", response.data.accessToken);
      setUser({
        id: response.data.user.id,
        email: response.data.user.email,
        groupId: response.data.user.groupId,
        accessToken: response.data.accessToken,
        role: response.data.user.role,
      });
      // 그룹 자동 선택은 로그인 성공 시점 1회만 수행한다 (이후에는 사용자의 선택/해제를 존중).
      setSelectedGroup(response.data.user.groupId ?? null);
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
          <AuthSwitchButton onClick={() => setView("signup")}>회원가입</AuthSwitchButton>
        </AuthSwitchRow>
        <AuthSwitchRow>
          <AuthSwitchButton onClick={() => setView("reset")}>
            비밀번호를 잊으셨나요?
          </AuthSwitchButton>
        </AuthSwitchRow>
      </AuthCard>
    </AuthContainer>
  );
};

export default Login;
