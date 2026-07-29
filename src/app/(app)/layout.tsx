import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const user = session.user as any;
  const isAdmin = user.role === Role.ADMIN;

  // 计算未读公告数
  const totalAnnouncements = await prisma.announcement.count();
  const readAnnouncements = await prisma.announcementRead.count({
    where: { userId: user.id },
  });
  const unreadAnnouncements = Math.max(0, totalAnnouncements - readAnnouncements);

  // 计算未报名的进行中赛事数
  const upcomingEvents = await prisma.event.findMany({
    where: { status: "UPCOMING" },
    select: { id: true },
  });
  const upcomingEventIds = upcomingEvents.map((e) => e.id);
  const myRegistrations = await prisma.registration.count({
    where: {
      userId: user.id,
      status: "REGISTERED",
      eventId: { in: upcomingEventIds },
    },
  });
  const unregisteredEvents = Math.max(0, upcomingEvents.length - myRegistrations);

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
      badge: unregisteredEvents,
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
    <AppShell navItems={navItems} showAdmin={isAdmin}>
      {children}
    </AppShell>
  );
}
