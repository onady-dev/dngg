"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import Signup from "../components/Signup";
import type { AuthView } from "../components/Signup";
import Login from "../components/Login";
import PasswordReset from "../components/PasswordReset";
import { useAuthStore } from "@/app/stores/useAuthStore";
import { useGroupStore } from "@/app/stores/groupStore";
import { useToast } from "../components/ui/Toast";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { useMounted } from "@/app/lib/useMounted";
import { api } from "@/lib/axios";

const AccountContainer = styled.div`
  max-width: 480px;
  margin: calc(var(--header-height) + 28px) auto 0;
  padding: 0 1rem;
`;

const AccountCard = styled.div`
  background: white;
  border: 1px solid var(--border-color);
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
`;

const AccountTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 1rem;
`;

const InfoRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 0;
  border-bottom: 1px solid #f3f4f6;
  font-size: 0.9375rem;

  &:last-of-type {
    border-bottom: none;
  }
`;

const InfoLabel = styled.span`
  color: #6b7280;
`;

const InfoValue = styled.span`
  font-weight: 600;
  color: var(--text-color);
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-top: 1.25rem;
`;

const LogoutButton = styled.button`
  flex: 1;
  padding: 0.625rem;
  border-radius: 0.375rem;
  background: #f3f4f6;
  color: var(--text-color);
  font-weight: 600;
  font-size: 0.9375rem;

  &:hover {
    background: #e5e7eb;
  }
`;

const DeleteGroupButton = styled.button`
  width: 100%;
  margin-top: 0.75rem;
  padding: 0.625rem;
  border-radius: 0.375rem;
  background: #fef2f2;
  color: #dc2626;
  font-weight: 600;
  font-size: 0.9375rem;

  &:hover {
    background: #fee2e2;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ManualLink = styled.a`
  flex: 1;
  padding: 0.625rem;
  border-radius: 0.375rem;
  background: var(--primary-color);
  color: white;
  font-weight: 600;
  font-size: 0.9375rem;
  text-align: center;

  &:hover {
    background: var(--hover-color);
  }
`;

const SubscriptionButton = styled.button`
  width: 100%;
  margin-top: 0.75rem;
  padding: 0.625rem;
  border-radius: 0.375rem;
  background: var(--primary-color);
  color: white;
  font-weight: 600;
  font-size: 0.9375rem;

  &:hover {
    background: var(--hover-color);
  }
`;

const NameEditRow = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const NameInput = styled.input`
  width: 9rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  font-size: 0.875rem;
`;

const NameSaveButton = styled.button`
  padding: 0.375rem 0.75rem;
  border-radius: 0.375rem;
  background: var(--primary-color);
  color: white;
  font-weight: 600;
  font-size: 0.8125rem;

  &:disabled {
    opacity: 0.6;
  }
`;

const SettingsPage = () => {
  const router = useRouter();
  const { user, logout } = useAuthStore((state) => state);
  const { groups, deleteGroup } = useGroupStore();
  // 랜딩 CTA(/settings#signup)로 들어오면 로그인이 아니라 가입 폼에서 시작한다.
  // useSearchParams를 쓰면 Suspense 경계가 강제되고 이 라우트의 정적 렌더가 깨지므로
  // 해시를 쓴다. 서버에서는 window가 없어 "login"으로 떨어지는데, 이 컴포넌트는
  // useMounted 게이트로 마운트 전까지 null을 렌더하므로 hydration 불일치가 없다.
  const [view, setView] = useState<AuthView>(() =>
    typeof window !== "undefined" && window.location.hash === "#signup" ? "signup" : "login"
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const setUser = useAuthStore((state) => state.setUser);
  const { showToast } = useToast();
  const confirm = useConfirm();
  const mounted = useMounted();

  if (!mounted) return null;

  if (!user) {
    if (view === "signup") return <Signup setView={setView} />;
    if (view === "reset") return <PasswordReset setView={setView} />;
    return <Login setView={setView} />;
  }

  const myGroup = groups.find((group) => group.id === user.groupId);

  const handleDeleteGroup = async () => {
    if (!myGroup || isDeleting) return;

    const ok = await confirm({
      title: "그룹 삭제",
      message: `'${myGroup.name}' 그룹을 삭제하시겠습니까?\n삭제된 그룹은 그룹 목록에서 보이지 않게 됩니다.`,
      confirmText: "삭제",
      danger: true,
    });
    if (!ok) return;

    setIsDeleting(true);
    try {
      await deleteGroup(myGroup.id);
      showToast("그룹이 삭제되었습니다.", "info");
    } catch {
      showToast("그룹 삭제에 실패했습니다. 잠시 후 다시 시도해주세요.", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || !user || isSavingName) return;
    setIsSavingName(true);
    try {
      await api.put(`/user/${user.id}`, { name: trimmed });
      setUser({ ...user, name: trimmed });
      showToast("이름이 저장되었습니다.", "success");
    } catch {
      showToast("이름 저장에 실패했습니다. 잠시 후 다시 시도해주세요.", "error");
    } finally {
      setIsSavingName(false);
    }
  };

  return (
    <AccountContainer>
      <AccountCard>
        <AccountTitle>내 계정</AccountTitle>
        <InfoRow>
          <InfoLabel>이름</InfoLabel>
          {user.name ? (
            <InfoValue>{user.name}</InfoValue>
          ) : (
            <NameEditRow>
              <NameInput
                type="text"
                placeholder="이름 입력"
                value={nameInput}
                maxLength={30}
                onChange={(e) => setNameInput(e.target.value)}
              />
              <NameSaveButton onClick={handleSaveName} disabled={isSavingName}>
                저장
              </NameSaveButton>
            </NameEditRow>
          )}
        </InfoRow>
        <InfoRow>
          <InfoLabel>아이디</InfoLabel>
          <InfoValue>{user.email}</InfoValue>
        </InfoRow>
        <InfoRow>
          <InfoLabel>소속 그룹</InfoLabel>
          <InfoValue>{myGroup?.name ?? "-"}</InfoValue>
        </InfoRow>
        <ButtonRow>
          <LogoutButton
            onClick={() => {
              logout();
              setView("login");
              showToast("로그아웃되었습니다.", "info");
            }}
          >
            로그아웃
          </LogoutButton>
          <ManualLink href="/manual/index.html">사용 가이드 보기</ManualLink>
        </ButtonRow>
        <SubscriptionButton onClick={() => router.push("/subscription")}>
          구독 관리
        </SubscriptionButton>
        <SubscriptionButton onClick={() => router.push("/inquiry")}>
          문의·피드백
        </SubscriptionButton>
        {user?.role === "admin" && (
          <SubscriptionButton onClick={() => router.push("/admin")}>
            관리자 페이지
          </SubscriptionButton>
        )}
        {myGroup && (
          <DeleteGroupButton onClick={handleDeleteGroup} disabled={isDeleting}>
            {isDeleting ? "삭제 중..." : "그룹 삭제"}
          </DeleteGroupButton>
        )}
      </AccountCard>
    </AccountContainer>
  );
};

export default SettingsPage;
