import React, { useEffect, useState } from 'react';
import { useGroupStore } from '../stores/groupStore';
import * as S from '../styles/ModalStyles';
import { useToast } from './ui/Toast';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateGroupModal({ isOpen, onClose }: CreateGroupModalProps) {
  const [groupName, setGroupName] = useState('');
  const { createGroup } = useGroupStore();
  const { showToast } = useToast();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    try {
      await createGroup(groupName);
      setGroupName('');
      onClose();
      showToast('그룹이 생성되었습니다.', 'success');
    } catch (error) {
      console.error('그룹 생성 실패:', error);
      showToast('그룹 생성에 실패했습니다. 다시 시도해주세요.', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <S.ModalOverlay onClick={onClose}>
      <S.ModalContent role="dialog" aria-modal="true" aria-label="새 그룹 생성" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <S.ModalHeader>
          <h2>새 그룹 생성</h2>
          <S.CloseButton onClick={onClose} aria-label="닫기">&times;</S.CloseButton>
        </S.ModalHeader>
        <form onSubmit={handleSubmit}>
          <S.ModalBody>
            <S.InputGroup>
              <label htmlFor="groupName">그룹 이름</label>
              <input
                id="groupName"
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="그룹 이름을 입력하세요"
              />
            </S.InputGroup>
          </S.ModalBody>
          <S.ModalFooter>
            <S.Button type="button" onClick={onClose} variant="secondary">
              취소
            </S.Button>
            <S.Button type="submit" variant="primary">
              생성
            </S.Button>
          </S.ModalFooter>
        </form>
      </S.ModalContent>
    </S.ModalOverlay>
  );
}
