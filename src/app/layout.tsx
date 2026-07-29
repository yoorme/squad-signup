import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "MMR战队报名系统",
  description: "三角洲行动战队内部赛事报名系统",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <SessionProvider>
          <ToastProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
