import Link from "next/link";

export default function AdminHome() {
  const sections = [
    {
      href: "/admin/tags",
      title: "标签维护",
      desc: "管理能力、职责、干员、赛事性质、赛事名称、分队性质等标签",
      icon: "🏷️",
    },
    {
      href: "/admin/users",
      title: "用户管理",
      desc: "查看队员列表、提升/取消管理员、重置密码、禁用账号",
      icon: "👥",
    },
    {
      href: "/admin/invitations",
      title: "邀请码管理",
      desc: "生成新队员注册邀请码、查看使用情况",
      icon: "🎫",
    },
    {
      href: "/admin/announcements",
      title: "公告管理",
      desc: "发布公告、编辑/删除公告、查看阅读统计",
      icon: "📢",
    },
    {
      href: "/admin/events/new",
      title: "创建赛事",
      desc: "创建新赛事并设置分队数量与性质",
      icon: "🏆",
    },
  ];

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>管理后台</h1>
      <p style={{ fontSize: 13, color: "var(--win-text-secondary)", marginBottom: 24 }}>
        管理战队系统各类配置与数据
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="win-card win-reveal"
            style={{
              padding: 20,
              textDecoration: "none",
              color: "inherit",
              cursor: "pointer",
              display: "block",
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{s.title}</h3>
            <p style={{ fontSize: 13, color: "var(--win-text-secondary)", lineHeight: 1.5 }}>{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
