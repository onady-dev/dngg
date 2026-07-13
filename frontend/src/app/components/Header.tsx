"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useGroupStore } from "../stores/groupStore";
import * as S from "../styles/HeaderStyles";
import { useAuthStore } from "@/app/stores/useAuthStore";
import { useRouter } from "next/navigation";
import { useToast } from "./ui/Toast";

export default function Header() {
  const router = useRouter();
  const { user } = useAuthStore((state) => state);
  const { selectedGroup, setSelectedGroup, groups, loadGroups } = useGroupStore();
  const { showToast } = useToast();

  const canManage = !!user && user.groupId === selectedGroup;

  useEffect(() => {
    loadGroups();
  }, []);

  useEffect(() => {
    if (user) {
      setSelectedGroup(user.groupId);
    }
  }, [user]);

  const onChangeGroup = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedGroup(Number(e.target.value));
    router.push("/");
  };

  const handleLockedMenuClick = (e: React.MouseEvent) => {
    if (canManage) return;
    e.preventDefault();
    if (!user) {
      showToast("로그인 후 이용할 수 있는 메뉴입니다.", "info");
      router.push("/settings");
    } else {
      showToast("내 소속 그룹을 선택하면 이용할 수 있습니다.", "info");
    }
  };

  const lockIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  );

  return (
    <S.HeaderContainer>
      <S.HeaderInner>
        <S.LogoNavContainer>
          <S.Logo>
            <Link href="/">DN.GG</Link>
          </S.Logo>
          <S.Navigation aria-label="주요 메뉴">
            <Link href="/daily">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 3v4M8 3v4M3 9h18" />
              </svg>
              <span>daily</span>
            </Link>
            <Link href="/rankings">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0" />
              </svg>
              <span>rankings</span>
            </Link>
            <Link href="/teams" onClick={handleLockedMenuClick} aria-disabled={!canManage}>
              {canManage ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                </svg>
              ) : (
                lockIcon
              )}
              <span>teams</span>
            </Link>
            <Link href="/games" onClick={handleLockedMenuClick} aria-disabled={!canManage}>
              {canManage ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 0 0 .658-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z" />
                </svg>
              ) : (
                lockIcon
              )}
              <span>games</span>
            </Link>
            <Link href="/settings">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.01c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.01 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.01 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.01c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.01c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.01-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.01-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.01z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
              </svg>
              <span>settings</span>
            </Link>
            <Link href="/manual/index.html">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
              <span>manual</span>
            </Link>
          </S.Navigation>
        </S.LogoNavContainer>
        <S.GroupContainer>
          {groups.length > 0 ? (
            <S.GroupSelect value={selectedGroup || ""} onChange={onChangeGroup} aria-label="그룹 선택">
              <option value="">그룹 선택</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </S.GroupSelect>
          ) : (
            <S.EmptyStateText>등록된 그룹이 없습니다</S.EmptyStateText>
          )}
        </S.GroupContainer>
      </S.HeaderInner>
    </S.HeaderContainer>
  );
}
