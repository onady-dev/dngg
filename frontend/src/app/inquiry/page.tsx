"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { api } from "@/lib/axios";
import { useAuthStore } from "@/app/stores/useAuthStore";
import { useToast } from "@/app/components/ui/Toast";
import { useMounted } from "@/app/lib/useMounted";

const MAX_CONTENT = 2000;

const TYPE_OPTIONS = [
  { value: "bug", label: "버그 신고" },
  { value: "feature", label: "기능 제안" },
  { value: "billing", label: "결제·구독 문의" },
  { value: "etc", label: "기타" },
];

const Container = styled.div`
  max-width: 480px;
  margin: calc(var(--header-height) + 28px) auto 0;
  padding: 0 1rem;
`;

const Card = styled.div`
  background: white;
  border: 1px solid var(--border-color);
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
`;

const Title = styled.h2`
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
`;

const Desc = styled.p`
  font-size: 0.875rem;
  color: #6b7280;
  line-height: 1.5;
  margin-bottom: 1.25rem;
`;

const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.375rem;
`;

const Select = styled.select`
  width: 100%;
  padding: 0.625rem 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  font-size: 0.9375rem;
  background: white;
  margin-bottom: 1rem;
`;

const Textarea = styled.textarea`
  width: 100%;
  min-height: 9rem;
  padding: 0.625rem 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 0.375rem;
  font-size: 0.9375rem;
  font-family: inherit;
  line-height: 1.5;
  resize: vertical;
`;

const Counter = styled.div`
  text-align: right;
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 0.25rem;
`;

const SubmitButton = styled.button`
  width: 100%;
  margin-top: 1rem;
  padding: 0.625rem;
  border-radius: 0.375rem;
  background: var(--primary-color);
  color: white;
  font-weight: 600;
  font-size: 0.9375rem;

  &:hover {
    background: var(--hover-color);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const CancelButton = styled.button`
  width: 100%;
  margin-top: 0.5rem;
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

const InquiryPage = () => {
  const router = useRouter();
  const mounted = useMounted();
  const { user } = useAuthStore((state) => state);
  const { showToast } = useToast();
  const [type, setType] = useState("bug");
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);

  // 비로그인 직접 접근 — 헤더의 handleLockedMenuClick과 같은 처리
  useEffect(() => {
    if (mounted && !user) {
      showToast("로그인 후 이용할 수 있습니다.", "info");
      router.replace("/settings");
    }
  }, [mounted, user, router, showToast]);

  if (!mounted || !user) return null;

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    try {
      await api.post("/inquiry", { type, content: trimmed });
      showToast(
        "문의가 접수되었습니다. 답변은 가입하신 이메일로 보내드립니다.",
        "success",
      );
      router.push("/settings");
    } catch {
      showToast(
        "문의 전송에 실패했습니다. 잠시 후 다시 시도해주세요.",
        "error",
      );
      setIsSending(false);
    }
  };

  return (
    <Container>
      <Card>
        <Title>문의·피드백</Title>
        <Desc>
          버그 제보나 기능 제안을 남겨주세요. 답변은 가입하신 이메일(
          {user.email})로 보내드립니다.
        </Desc>

        <Label htmlFor="inquiry-type">문의 유형</Label>
        <Select
          id="inquiry-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Label htmlFor="inquiry-content">내용</Label>
        <Textarea
          id="inquiry-content"
          value={content}
          maxLength={MAX_CONTENT}
          placeholder="어떤 상황에서 무슨 일이 있었는지 적어주시면 확인에 큰 도움이 됩니다."
          onChange={(e) => setContent(e.target.value)}
        />
        <Counter>
          {content.length} / {MAX_CONTENT}
        </Counter>

        <SubmitButton
          onClick={handleSubmit}
          disabled={isSending || !content.trim()}
        >
          {isSending ? "전송 중..." : "보내기"}
        </SubmitButton>
        <CancelButton onClick={() => router.push("/settings")}>
          취소
        </CancelButton>
      </Card>
    </Container>
  );
};

export default InquiryPage;
