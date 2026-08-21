import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";
import { getSiteSettings } from "@/lib/site-settings";
import { prefixDisplayName } from "@/lib/constants";
import "./globals.css";

// 全站动态渲染：站点标题依赖数据库中的战队前缀，
// 且避免构建期（GitHub Actions 无数据库连接）预渲染访问数据库
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { teamPrefix } = await getSiteSettings();
  const displayName = prefixDisplayName(teamPrefix);
  return {
    title: `${displayName}战队报名系统`,
    description: "三角洲行动战队内部赛事报名系统",
  };
}

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
