"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import styled from "styled-components";
import { useAuthStore } from "../stores/useAuthStore";
import { useGroupStore } from "../stores/groupStore";
import { fetchTeams } from "@/lib/teamApi";

const Card = styled.div`
  background: white;
  border: 1px solid var(--border-color);
  border-radius: 0.75rem;
  padding: 1.25rem;
  margin-bottom: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
`;

const CardTitle = styled.h3`
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
`;

const CardSubtitle = styled.p`
  font-size: 0.8125rem;
  color: #6b7280;
  margin-bottom: 1rem;
`;

const StepList = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
`;

const StepItem = styled.li<{ done: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.625rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  color: ${(props) => (props.done ? "#9ca3af" : "var(--text-color)")};
  text-decoration: ${(props) => (props.done ? "line-through" : "none")};
  background-color: ${(props) => (props.done ? "transparent" : "#f9fafb")};

  a {
    margin-left: auto;
    color: var(--primary-color);
    font-weight: 600;
    font-size: 0.8125rem;
    white-space: nowrap;

    &:hover {
      text-decoration: underline;
    }
  }
`;

const StepBadge = styled.span<{ done: boolean }>`
  flex-shrink: 0;
  width: 1.375rem;
  height: 1.375rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  color: white;
  background-color: ${(props) => (props.done ? "#16a34a" : "#9ca3af")};
`;

const GuideLink = styled.a`
  display: inline-block;
  margin-top: 0.875rem;
  font-size: 0.8125rem;
  color: var(--primary-color);
  font-weight: 600;

  &:hover {
    text-decoration: underline;
  }
`;

interface OnboardingChecklistProps {
  hasGames: boolean;
}

export default function OnboardingChecklist({ hasGames }: OnboardingChecklistProps) {
  const user = useAuthStore((state) => state.user);
  const { selectedGroup } = useGroupStore();
  const [hasTeams, setHasTeams] = useState(false);

  useEffect(() => {
    // 체크리스트가 렌더되지 않는 경우(hasGames)에는 불필요한 요청을 하지 않는다
    if (!selectedGroup || hasGames) return;
    let cancelled = false;
    fetchTeams(selectedGroup)
      .then((teams) => {
        if (!cancelled) setHasTeams(teams.length > 0);
      })
      .catch(() => {
        if (!cancelled) setHasTeams(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedGroup, hasGames]);

  const steps = [
    { label: "로그인하기", done: !!user, href: "/settings", linkText: "로그인" },
    { label: "그룹 선택하기", done: !!selectedGroup, href: null, linkText: "" },
    { label: "선수 추가하고 팀 구성하기", done: hasTeams, href: "/teams", linkText: "팀 관리" },
    { label: "새 게임 만들기", done: hasGames, href: "/games", linkText: "게임 관리" },
    { label: "경기 기록 시작하기", done: false, href: "/games", linkText: "게임 목록" },
  ];

  // 모든 단계를 마친 그룹에는 표시하지 않는다
  if (hasGames) return null;

  return (
    <Card>
      <CardTitle>시작 가이드</CardTitle>
      <CardSubtitle>DN.GG로 첫 경기를 기록하기까지 이 순서대로 진행하세요.</CardSubtitle>
      <StepList>
        {steps.map((step, index) => (
          <StepItem key={step.label} done={step.done}>
            <StepBadge done={step.done}>{step.done ? "✓" : index + 1}</StepBadge>
            {step.label}
            {!step.done && step.href && <Link href={step.href}>{step.linkText} →</Link>}
          </StepItem>
        ))}
      </StepList>
      <GuideLink href="/manual/index.html">📖 자세한 사용 가이드 보기</GuideLink>
    </Card>
  );
}
