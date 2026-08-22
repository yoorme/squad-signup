import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site-settings";
import { prefixDisplayName } from "@/lib/constants";
import { Role } from "@prisma/client";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const user = session.user;
  const isAdmin = user.role === Role.ADMIN;

  // 并行查询红点未读数（反连接一次查出，替代原先 total-read 的多查询差值计算）
  // - 公告：已归档的不计入未读红点
  // - 赛事：仅未读的进行中赛事（已归档/已过期不计入），点击进入详情即确认收到
  const [unreadAnnouncements, unreadEvents, settings] = await Promise.all([
    prisma.announcement.count({
      where: { isArchived: false, reads: { none: { userId: user.id } } },
    }),
    prisma.event.count({
      where: {
        status: "UPCOMING",
        eventTime: { gte: new Date() },
        reads: { none: { userId: user.id } },
      },
    }),
    getSiteSettings(),
  ]);

  const navItems = [
    {
      href: "/announcements",
      label: "公告",
      badge: unreadAnnouncements,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 11h3l9-5v12l-9-5H3z" strokeLinejoin="round" />
          <path d="M16 8a3 3 0 0 1 0 8" />
        </svg>
      ),
    },
    {
      href: "/events",
      label: "赛事",
      badge: unreadEvents,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      href: "/me",
      label: "我的",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 4-6 8-6s8 2 8 6" strokeLinecap="round" />
        </svg>
      ),
    },
  ];

  return (
    <AppShell
      navItems={navItems}
      showAdmin={isAdmin}
      iconVersion={settings.iconUpdatedAt?.getTime() ?? 0}
      teamDisplayName={prefixDisplayName(settings.teamPrefix)}
    >
      {children}
    </AppShell>
  );
}
