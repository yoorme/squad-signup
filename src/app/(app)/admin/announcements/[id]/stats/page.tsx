"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatDateTime } from "@/lib/constants";

interface Stats {
  totalUsers: number;
  readCount: number;
  confirmedCount: number;
  unreadUsers: { id: string; username: string; nickname: string }[];
  readUsers: {
    user: { id: string; username: string; nickname: string };
    readAt: string;
    confirmedAt: string | null;
  }[];
}

export default function AnnouncementStatsPage() {
  const params = useParams<{ id: string }>();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;
    fetch(`/api/announcements?mode=stats&id=${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setStats(data.data);
        setLoading(false);
      });
  }, [params.id]);

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: "var(--win-text-tertiary)" }}>加载中...</div>;
  if (!stats) return <div className="win-card" style={{ padding: 40, textAlign: "center" }}>无数据</div>;

  const readRate = stats.totalUsers > 0 ? Math.round((stats.readCount / stats.totalUsers) * 100) : 0;
  const confirmedRate = stats.totalUsers > 0 ? Math.round((stats.confirmedCount / stats.totalUsers) * 100) : 0;

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <Link href="/admin/announcements" style={{ fontSize: 13, color: "var(--win-text-secondary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        返回公告管理
      </Link>

      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>阅读统计</h1>

      {/* 统计数字 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div className="win-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--win-text-secondary)", marginBottom: 4 }}>已阅读</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{stats.readCount}<span style={{ fontSize: 14, color: "var(--win-text-tertiary)" }}>/{stats.totalUsers}</span></div>
          <div style={{ fontSize: 12, color: "var(--win-accent)", marginTop: 4 }}>阅读率 {readRate}%</div>
        </div>
        <div className="win-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--win-text-secondary)", marginBottom: 4 }}>已确认</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{stats.confirmedCount}</div>
          <div style={{ fontSize: 12, color: "var(--win-success)", marginTop: 4 }}>确认率 {confirmedRate}%</div>
        </div>
        <div className="win-card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: "var(--win-text-secondary)", marginBottom: 4 }}>未读</div>
          <div style={{ fontSize: 24, fontWeight: 600, color: stats.unreadUsers.length > 0 ? "var(--win-danger)" : "var(--win-text)" }}>{stats.unreadUsers.length}</div>
        </div>
      </div>

      {/* 未读名单 */}
      {stats.unreadUsers.length > 0 && (
        <div className="win-card" style={{ padding: 16, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>未阅读名单</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {stats.unreadUsers.map((u) => (
              <span key={u.id} className="win-chip" style={{ fontSize: 12, background: "rgba(209,52,56,0.08)", color: "var(--win-danger)", borderColor: "rgba(209,52,56,0.3)" }}>
                {u.username}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 已读详情 */}
      <div className="win-card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "2px solid var(--win-border)", fontSize: 13, fontWeight: 600 }}>
          已阅读详情
        </div>
        {stats.readUsers.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--win-text-tertiary)", fontSize: 13 }}>暂无</div>
        ) : (
          stats.readUsers.map((r, idx) => (
            <div
              key={r.user.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 16px",
                borderBottom: idx === stats.readUsers.length - 1 ? "none" : "1px solid var(--win-border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13 }}>{r.user.username}</span>
                {r.confirmedAt && (
                  <span className="win-chip" style={{ fontSize: 11, background: "var(--win-bg-selected)", color: "var(--win-success)", borderColor: "var(--win-success)", padding: "2px 6px" }}>
                    已确认
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: "var(--win-text-tertiary)", textAlign: "right" }}>
                <div>阅读 {formatDateTime(r.readAt)}</div>
                {r.confirmedAt && <div>确认 {formatDateTime(r.confirmedAt)}</div>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
