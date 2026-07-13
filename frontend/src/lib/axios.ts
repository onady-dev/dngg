import { useAuthStore } from "@/app/stores/useAuthStore";
import axios from "axios";
import { setPendingToast, showGlobalToast } from "@/lib/toastBus";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

// 브라우저 환경인지 확인하는 함수
const isBrowser = () => typeof window !== "undefined";

// 요청 인터셉터
api.interceptors.request.use(
  (config) => {
    // 토큰이 필요한 경우 여기에서 처리 (브라우저 환경에서만 localStorage 사용)
    if (isBrowser()) {
      const token = localStorage.getItem("token");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

const SESSION_EXPIRED_MESSAGE = "로그인이 만료되어 로그아웃되었습니다.";

// 응답 인터셉터
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Authorization 헤더를 싣고 나간 요청의 401만 토큰 만료로 처리한다.
    // (로그인 등 토큰 없이 나가는 요청의 401은 각 호출부의 catch에서 처리)
    const hadAuthHeader = Boolean(error.config?.headers?.Authorization);
    if (isBrowser() && error.response?.status === 401 && hadAuthHeader) {
      localStorage.removeItem("token");
      useAuthStore.getState().logout();
      if (window.location.pathname === "/settings") {
        showGlobalToast(SESSION_EXPIRED_MESSAGE, "error");
      } else {
        setPendingToast(SESSION_EXPIRED_MESSAGE, "error");
        window.location.href = "/settings";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
