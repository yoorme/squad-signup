"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { formatDateTime } from "@/lib/constants";
import { Loading } from "@/components/ui/StateView";

interface AnnouncementListItem {
  id: string;
  title: string;
  author: { username: string; nickname: string };
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
  isRead: boolean;
  commentCount: number;
}

// 公告列表：默认展示正常公告；管理员可切换 正常/已归档/全部
// 已归档公告仅管理员可见（普通队员任何 tab 都不会返回）
export default function AnnouncementsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const [items, setItems] = useState<AnnouncementListItem[]>([]);
  const [filter, setFilter] = useState<"normal" | "archived" | "all">("normal");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/announcements?status=${filter}`);
    const data = await res.json();
    if (data.ok) setItems(data.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 880, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>公告</h1>
          <p style={{ fontSize: 13, color: "var(--win-text-secondary)", marginTop: 4 }}>
            查看战队管理员发布的通知与公告
          </p>
        </div>
        {/* 管理员可查看已归档/全部；普通队员只看正常公告 */}
        {isAdmin && (
          <div style={{ display: "flex", gap: 4, padding: 4, background: "var(--win-bg-hover)", borderRadius: 6 }}>
            {(["normal", "archived", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 4,
                  border: "none",
                  background: filter === f ? "var(--win-bg-card-solid)" : "transparent",
                  color: filter === f ? "var(--win-accent)" : "var(--win-text-secondary)",
                  fontSize: 13,
                  cursor: "pointer",
                  fontWeight: filter === f ? 600 : 400,
                  boxShadow: filter === f ? "var(--win-shadow-card)" : "none",
                }}
              >
                {f === "normal" ? "正常" : f === "archived" ? "已归档" : "全部"}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="win-card" style={{ padding: 40, textAlign: "center", color: "var(--win-text-tertiary)" }}>
          暂无公告
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/announcements/${item.id}`}
              className="win-card win-reveal"
              style={{
                padding: 20,
                display: "block",
                textDecoration: "none",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    {!item.isRead && (
                      <span style={{ width: 8, height: 8, background: "var(--win-danger)", borderRadius: "50%", flexShrink: 0 }} />
                    )}
                    {/* 已归档标签：仅归档的公告展示（类似赛事界面的性质标签） */}
                    {item.isArchived && (
                      <span className="win-chip" style={{ fontSize: 11, background: "var(--win-bg-pressed)", color: "var(--win-text-tertiary)", flexShrink: 0 }}>
                        已归档
                      </span>
                    )}
                    <h3 style={{ fontSize: 16, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.title}
                    </h3>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--win-text-tertiary)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>{item.author.username}</span>
                    <span>{formatDateTime(item.createdAt)}</span>
                    {item.updatedAt !== item.createdAt && <span>已更新</span>}
                    <span>{item.commentCount} 条留言</span>
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--win-text-tertiary)", flexShrink: 0, marginTop: 4 }}>
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
