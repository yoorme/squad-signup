"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/constants";

interface AnnouncementListItem {
  id: string;
  title: string;
  author: { username: string; nickname: string };
  createdAt: string;
  updatedAt: string;
  isRead: boolean;
  isConfirmed: boolean;
  commentCount: number;
}

export default function AnnouncementsPage() {
  const [items, setItems] = useState<AnnouncementListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/announcements");
    const data = await res.json();
    if (data.ok) setItems(data.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 880, margin: "0 auto" }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>公告</h1>
        <p style={{ fontSize: 13, color: "var(--win-text-secondary)", marginTop: 4 }}>
          查看战队管理员发布的通知与公告
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--win-text-tertiary)" }}>加载中...</div>
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
                    <h3 style={{ fontSize: 16, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.title}
                    </h3>
                    {item.isConfirmed && (
                      <span className="win-chip" style={{ background: "var(--win-bg-selected)", color: "var(--win-success)", borderColor: "var(--win-success)", fontSize: 11, padding: "2px 8px" }}>
                        已确认
                      </span>
                    )}
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
