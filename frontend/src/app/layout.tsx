import React from "react";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import StyledComponentsRegistry from "./registry";
import Header from "./components/Header";
import GlobalStyles from "./styles/GlobalStyles";
import InstallPrompt from "./components/InstallPrompt";
import { ToastProvider } from "./components/ui/Toast";
import { ConfirmProvider } from "./components/ui/ConfirmDialog";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

// 상대 metadata URL(og:image 등)을 절대 URL로 해석하는 기준.
// 미설정 시 http://localhost:3000으로 잡혀 크롤러가 카드를 못 가져온다.
// 운영 NEXT_PUBLIC_API_URL=https://dngg.one/api → origin https://dngg.one.
const siteUrl = process.env.NEXT_PUBLIC_API_URL
  ? new URL(process.env.NEXT_PUBLIC_API_URL).origin
  : "http://localhost:3011";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "DN.GG",
  description: "농구 경기 기록·통계 서비스",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DN.GG",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={inter.className}>
        <Providers>
          <StyledComponentsRegistry>
            <GlobalStyles />
            <ToastProvider>
              <ConfirmProvider>
                <Header />
                <main>{children}</main>
                <InstallPrompt />
              </ConfirmProvider>
            </ToastProvider>
          </StyledComponentsRegistry>
        </Providers>
      </body>
    </html>
  );
}
