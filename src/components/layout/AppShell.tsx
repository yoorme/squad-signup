"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { prefixDisplayName } from "@/lib/constants";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  badge?: number;
}

interface AppShellProps {
  children: ReactNode;
  // 导航项由 (app)/layout.tsx 统一构造（含未读角标），此处不再提供默认值
  navItems: NavItem[];
  showAdmin?: boolean;
  // 战队名称前缀（战队管理中配置），用于侧边栏标识展示
  teamPrefix?: string;
}

export function AppShell({ children, navItems, showAdmin, teamPrefix }: AppShellProps) {
  const pathname = usePathname();
  const displayName = prefixDisplayName(teamPrefix ?? "");

  const adminItem: NavItem = {
    href: "/admin",
    label: "管理",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  };

  const items = showAdmin ? [...navItems, adminItem] : navItems;

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + "/");

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "row" }}>
      {/* 横屏/PC：左侧导航 */}
      <aside
        className="acrylic-strong"
        style={{
          display: "none",
          flexDirection: "column",
          width: 240,
          flexShrink: 0,
          padding: "16px 12px",
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
          borderRight: "1px solid var(--win-border)",
        }}
        id="desktop-nav"
      >
        <div style={{ padding: "12px 12px 24px", display: "flex", alignItems: "center", gap: 8 }}>
          {displayName ? (
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: "linear-gradient(135deg, var(--win-accent), var(--win-accent-pressed))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontWeight: 700,
                fontSize: displayName.length > 3 ? 11 : 14,
                flexShrink: 0,
              }}
            >
              {displayName}
            </div>
          ) : (
            // 无前缀时用战队图标（与管理后台配置的网页图标一致）
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/favicon.ico"
              alt="战队图标"
              width={32}
              height={32}
              style={{ borderRadius: 6, imageRendering: "pixelated", flexShrink: 0 }}
            />
          )}
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--win-text)" }}>战队报名</div>
            <div style={{ fontSize: 11, color: "var(--win-text-tertiary)" }}>三角洲行动</div>
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`win-nav-item ${isActive(item.href) ? "active" : ""}`}
            >
              {item.icon}
              <span>{item.label}</span>
              {!!item.badge && item.badge > 0 && (
                <span className="win-badge-count" style={{ marginLeft: "auto" }}>
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </aside>

      {/* 主内容区 */}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          maxWidth: 1280,
          margin: "0 auto",
          width: "100%",
          padding: "16px 16px 80px",
        }}
        id="main-content"
      >
        {children}
      </main>

      {/* 竖屏：底部导航 */}
      <nav
        className="acrylic-strong"
        style={{
          display: "none",
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: 60,
          borderTop: "1px solid var(--win-border)",
          zIndex: 40,
          justifyContent: "space-around",
          alignItems: "center",
        }}
        id="mobile-nav"
      >
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                color: active ? "var(--win-accent)" : "var(--win-text-secondary)",
                fontSize: 11,
                padding: "6px 12px",
                borderRadius: 6,
                position: "relative",
              }}
            >
              <div style={{ position: "relative" }}>
                {item.icon}
                {!!item.badge && item.badge > 0 && (
                  <span
                    className="win-badge-count"
                    style={{ position: "absolute", top: -6, right: -10 }}
                  >
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </div>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 队员入口：仅在公告页面显示，浮动在内容区左下角（导航栏右侧） */}
      {pathname === "/announcements" && (
        <Link
          href="/members"
          id="members-fab"
          className="acrylic-strong"
          style={{
            position: "fixed",
            bottom: 76,
            left: 16,
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 999,
            textDecoration: "none",
            color: "var(--win-text-secondary)",
            fontSize: 13,
            fontWeight: 500,
            border: "1px solid var(--win-border)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>队员</span>
        </Link>
      )}

      {/* 响应式切换：>=768px 显示左侧栏，<768px 显示底部栏 */}
      <style>{`
        @media (min-width: 768px) {
          #desktop-nav { display: flex !important; }
          #main-content { padding-bottom: 16px !important; }
          #members-fab { left: 256px !important; bottom: 16px !important; }
        }
        @media (max-width: 767px) {
          #mobile-nav { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
