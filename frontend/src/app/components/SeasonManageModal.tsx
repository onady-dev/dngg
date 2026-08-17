"use client";

import React, { useState } from "react";
import styled from "styled-components";
import {
  Season,
  createSeason,
  deleteSeason,
  renameSeason,
  setCurrentSeason,
} from "@/lib/seasonApi";
import { useToast } from "./ui/Toast";
import { useConfirm } from "./ui/ConfirmDialog";

interface Props {
  isOpen: boolean;
  groupId: number;
  seasons: Season[];
  currentSeasonId: number | null;
  onClose: () => void;
  onChanged: () => void;
}

export default function SeasonManageModal({
  isOpen,
  groupId,
  seasons,
  currentSeasonId,
  onClose,
  onChanged,
}: Props) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      showToast("시즌 이름을 입력해주세요.", "error");
      return;
    }
    setBusy(true);
    try {
      await createSeason(groupId, name);
      setNewName("");
      showToast("시즌을 만들었습니다.", "success");
      onChanged();
    } catch (error: any) {
      showToast(
        error?.response?.data?.message ?? "시즌 생성에 실패했습니다.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (season: Season) => {
    const name = window.prompt("새 시즌 이름", season.name)?.trim();
    if (!name || name === season.name) return;
    setBusy(true);
    try {
      await renameSeason(season.id, groupId, name);
      showToast("시즌 이름을 바꿨습니다.", "success");
      onChanged();
    } catch (error: any) {
      showToast(
        error?.response?.data?.message ?? "이름 변경에 실패했습니다.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (season: Season) => {
    const ok = await confirm({
      title: "시즌을 삭제할까요?",
      message: `"${season.name}"에 속한 경기는 삭제되지 않고 시즌 미지정으로 돌아갑니다.`,
      confirmText: "삭제",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const { affectedGames } = await deleteSeason(season.id);
      showToast(
        `시즌을 삭제했습니다. 경기 ${affectedGames}건이 시즌 미지정으로 돌아갔습니다.`,
        "success"
      );
      onChanged();
    } catch (error: any) {
      showToast(
        error?.response?.data?.message ?? "시즌 삭제에 실패했습니다.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSetCurrent = async (seasonId: number | null) => {
    setBusy(true);
    try {
      await setCurrentSeason(groupId, seasonId);
      showToast(
        seasonId === null
          ? "현재 시즌을 해제했습니다."
          : "현재 시즌을 지정했습니다.",
        "success"
      );
      onChanged();
    } catch (error: any) {
      showToast(
        error?.response?.data?.message ?? "현재 시즌 지정에 실패했습니다.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay onClick={onClose}>
      <Panel onClick={(e) => e.stopPropagation()}>
        <Title>시즌 관리</Title>

        <CreateRow>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="예: 2026 봄 리그"
            maxLength={30}
            disabled={busy}
          />
          <PrimaryButton onClick={handleCreate} disabled={busy}>
            추가
          </PrimaryButton>
        </CreateRow>

        <List>
          {seasons.length === 0 && <Empty>아직 만든 시즌이 없습니다.</Empty>}
          {seasons.map((season) => (
            <Row key={season.id}>
              <RowName>
                {season.name}
                {season.id === currentSeasonId && <Badge>현재 시즌</Badge>}
              </RowName>
              <RowActions>
                {season.id === currentSeasonId ? (
                  <TextButton onClick={() => handleSetCurrent(null)} disabled={busy}>
                    해제
                  </TextButton>
                ) : (
                  <TextButton
                    onClick={() => handleSetCurrent(season.id)}
                    disabled={busy}
                  >
                    현재로
                  </TextButton>
                )}
                <TextButton onClick={() => handleRename(season)} disabled={busy}>
                  이름
                </TextButton>
                <DangerButton onClick={() => handleDelete(season)} disabled={busy}>
                  삭제
                </DangerButton>
              </RowActions>
            </Row>
          ))}
        </List>

        <CloseButton onClick={onClose}>닫기</CloseButton>
      </Panel>
    </Overlay>
  );
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
`;

const Panel = styled.div`
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  width: 100%;
  max-width: 420px;
  max-height: 80vh;
  overflow-y: auto;
`;

const Title = styled.h2`
  margin: 0 0 16px;
  font-size: 18px;
  font-weight: 700;
`;

const CreateRow = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
`;

const Input = styled.input`
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
`;

const PrimaryButton = styled.button`
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Empty = styled.p`
  color: #888;
  font-size: 14px;
  text-align: center;
  padding: 16px 0;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid #eee;
  border-radius: 8px;
`;

const RowName = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
`;

const Badge = styled.span`
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 999px;
  background: #dbeafe;
  color: #1d4ed8;
`;

const RowActions = styled.div`
  display: flex;
  gap: 4px;
`;

const TextButton = styled.button`
  background: none;
  border: none;
  color: #2563eb;
  font-size: 13px;
  cursor: pointer;
  padding: 4px 6px;
  &:disabled {
    opacity: 0.5;
  }
`;

const DangerButton = styled(TextButton)`
  color: #dc2626;
`;

const CloseButton = styled.button`
  width: 100%;
  margin-top: 16px;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  cursor: pointer;
`;
