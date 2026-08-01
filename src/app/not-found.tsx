import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        color: "var(--win-text, #1b1b1b)",
      }}
    >
      <div style={{ fontSize: 56, fontWeight: 700, opacity: 0.25 }}>404</div>
      <p style={{ color: "var(--win-text-secondary, #5d5d5d)" }}>
        页面不存在或已被移除
      </p>
      <Link href="/announcements" className="win-btn win-btn-primary">
        返回首页
      </Link>
    </div>
  );
}
