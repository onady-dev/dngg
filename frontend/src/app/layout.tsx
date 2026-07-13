import React from "react";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import StyledComponentsRegistry from "./registry";
import Header from "./components/Header";
import GlobalStyles from "./styles/GlobalStyles";
import InstallPrompt from "./components/InstallPrompt";
import { ToastProvider } from "./components/ui/Toast";
import { ConfirmProvider } from "./components/ui/ConfirmDialog";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
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
      </body>
    </html>
  );
}
