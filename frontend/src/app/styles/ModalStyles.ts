import styled from 'styled-components';

export const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 50;
  backdrop-filter: blur(8px);
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

export const ModalContent = styled.div`
  background: white;
  padding: 24px;
  border-radius: 12px;
  width: 100%;
  max-width: 480px;
  position: relative;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  animation: scaleIn 0.3s ease-out;
  margin: 0 1.5rem;
  transform: translateY(-10%);

  @keyframes scaleIn {
    from {
      transform: translateY(-10%) scale(0.95);
      opacity: 0;
    }
    to {
      transform: translateY(-10%) scale(1);
      opacity: 1;
    }
  }
`;

export const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;

  h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: #111827;
  }
`;

export const CloseButton = styled.button`
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 4px;
  color: #6B7280;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;

  &:hover {
    background-color: #F3F4F6;
    color: #111827;
  }
`;

export const ModalBody = styled.div`
  margin-bottom: 24px;
`;

export const InputGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;

  label {
    font-weight: 500;
    color: #374151;
    font-size: 0.9rem;
  }

  input {
    padding: 10px 14px;
    border: 1px solid #E5E7EB;
    border-radius: 8px;
    font-size: 1rem;
    transition: all 0.2s ease;
    background-color: #F9FAFB;

    &::placeholder {
      color: #9CA3AF;
    }

    &:hover {
      border-color: #D1D5DB;
      background-color: white;
    }

    &:focus {
      outline: none;
      border-color: #2563EB;
      background-color: white;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }
  }
`;

export const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 32px;
`;

export const Button = styled.button<{ variant: 'primary' | 'secondary' }>`
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s ease;
  
  ${({ variant }) => variant === 'primary' ? `
    background-color: #2563EB;
    color: white;
    
    &:hover {
      background-color: #1D4ED8;
    }

    &:active {
      background-color: #1E40AF;
    }
  ` : `
    background-color: #F3F4F6;
    color: #374151;
    
    &:hover {
      background-color: #E5E7EB;
    }

    &:active {
      background-color: #D1D5DB;
    }
  `}
`; 