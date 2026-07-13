"use client";

import { useEffect, useState } from "react";
import styled from "styled-components";

const InstallPrompt = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone ||
      document.referrer.includes("android-app://");

    if (isStandalone) return;

    const dismissed = localStorage.getItem("installPromptDismissed");
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) {
      return;
    }

    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    if (iOS) {
      setShowPrompt(true);
    } else {
      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setShowPrompt(true);
      };
      window.addEventListener("beforeinstallprompt", handler);
      return () => window.removeEventListener("beforeinstallprompt", handler);
    }
  }, []);

  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSModal(true);
    } else if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("installPromptDismissed", Date.now().toString());
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <>
      <Banner>
        <Content>
          <Icon>📱</Icon>
          <Text>홈 화면에 추가하고 앱처럼 사용하세요</Text>
        </Content>
        <Actions>
          <InstallButton onClick={handleInstall}>추가</InstallButton>
          <CloseButton onClick={handleDismiss}>✕</CloseButton>
        </Actions>
      </Banner>

      {showIOSModal && (
        <Modal onClick={() => setShowIOSModal(false)}>
          <ModalContent onClick={(e) => e.stopPropagation()}>
            <ModalTitle>홈 화면에 추가하기</ModalTitle>
            <Steps>
              <Step>
                <StepNumber>1</StepNumber>
                <StepText>
                  하단의 <ShareIcon>⎋</ShareIcon> 공유 버튼을 누르세요
                </StepText>
              </Step>
              <Step>
                <StepNumber>2</StepNumber>
                <StepText>"홈 화면에 추가"를 선택하세요</StepText>
              </Step>
              <Step>
                <StepNumber>3</StepNumber>
                <StepText>"추가"를 눌러 완료하세요</StepText>
              </Step>
            </Steps>
            <ModalButton onClick={() => setShowIOSModal(false)}>확인</ModalButton>
          </ModalContent>
        </Modal>
      )}
    </>
  );
};

const Banner = styled.div`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #1a1a1a;
  color: white;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  animation: slideUp 0.3s ease-out;

  @keyframes slideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }
`;

const Content = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
`;

const Icon = styled.div`
  font-size: 24px;
`;

const Text = styled.div`
  font-size: 14px;
  line-height: 1.4;
`;

const Small = styled.span`
  font-size: 12px;
  opacity: 0.8;
`;

const Modal = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
  animation: fadeIn 0.2s ease-out;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

const ModalContent = styled.div`
  background: white;
  border-radius: 12px;
  padding: 24px;
  margin: 20px;
  max-width: 400px;
  width: 100%;
  animation: slideIn 0.3s ease-out;

  @keyframes slideIn {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
`;

const ModalTitle = styled.h3`
  margin: 0 0 20px 0;
  font-size: 20px;
  font-weight: 600;
  color: #1a1a1a;
  text-align: center;
`;

const Steps = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
`;

const Step = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
`;

const StepNumber = styled.div`
  background: #4caf50;
  color: white;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
`;

const StepText = styled.div`
  color: #333;
  font-size: 15px;
  line-height: 1.5;
  padding-top: 2px;
`;

const ShareIcon = styled.span`
  display: inline-block;
  font-weight: bold;
  color: #007aff;
  font-size: 18px;
`;

const ModalButton = styled.button`
  width: 100%;
  background: #4caf50;
  color: white;
  border: none;
  padding: 12px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: #45a049;
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const InstallButton = styled.button`
  background: #4caf50;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  font-weight: 600;

  &:hover {
    background: #45a049;
  }
`;

const CloseButton = styled.button`
  background: transparent;
  color: white;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
  opacity: 0.7;

  &:hover {
    opacity: 1;
  }
`;

export default InstallPrompt;
