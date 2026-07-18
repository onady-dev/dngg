import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useGroupStore } from './groupStore';

interface User {
  id: string;
  email: string;
  groupId: number;
  accessToken: string;
  role?: string;
  name?: string | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      logout: () => {
        localStorage.removeItem('token');
        set({ user: null, isAuthenticated: false });
        // 로그아웃은 그룹 선택도 초기화한다 (selectedGroupId 저장값 포함).
        useGroupStore.getState().setSelectedGroup(null);
      },
    }),
    {
      name: 'auth-storage', // localStorage key 이름
    }
  )
); 