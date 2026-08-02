"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { formatDateTime } from "@/lib/constants";
import { Loading } from "@/components/ui/StateView";

interface AnnouncementItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  _count?: { comments: number; reads: number };
}

export default function AdminAnnouncementsPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalUsers, setTotalUsers] = useState(0);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/announcements");
    const data = await res.json();
    if (data.ok) {
      setItems(data.data.announcements);
      setTotalUsers(data.data.totalUsers);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (item: AnnouncementItem) => {
    const yes = await confirm({
      title: "删除公告",
      message: `确定要删除公告「${item.title}」吗？关联的留言和图片会一并删除，无法恢复。`,
      danger: true,
    });
    if (!yes) return;
    const res = await fetch(`/api/announcements?id=${item.id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      toast("已删除", "success");
      load();
    } else {
      toast(data.error || "删除失败", "error");
    }
  };

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <Link href="/admin" style={{ fontSize: 13, color: "var(--win-text-secondary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        返回管理首页
      </Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>公告管理</h1>
          <p style={{ fontSize: 13, color: "var(--win-text-secondary)" }}>共 {items.length} 条公告，{totalUsers} 名队员</p>
        </div>
        <Link href="/admin/announcements/new" className="win-btn win-btn-primary">+ 发布公告</Link>
      </div>

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="win-card" style={{ padding: 40, textAlign: "center", color: "var(--win-text-tertiary)" }}>暂无公告</div>
      ) : (
        <div className="win-card" style={{ overflow: "hidden" }}>
          {items.map((item, idx) => {
            const readCount = item._count?.reads || 0;
            const readRate = totalUsers > 0 ? Math.round((readCount / totalUsers) * 100) : 0;
            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "14px 16px",
                  borderBottom: idx === items.length - 1 ? "none" : "1px solid var(--win-border)",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link
                    href={`/announcements/${item.id}`}
                    style={{ fontSize: 14, fontWeight: 500, color: "var(--win-text)", textDecoration: "none", display: "block", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {item.title}
                  </Link>
                  <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--win-text-tertiary)", flexWrap: "wrap" }}>
                    <span>{formatDateTime(item.createdAt)}</span>
                    <span>已读 {readCount}/{totalUsers}（{readRate}%）</span>
                    <span>留言 {item._count?.comments || 0}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <Link href={`/admin/announcements/${item.id}/edit`} className="win-btn" style={{ fontSize: 12, padding: "4px 10px", minHeight: 28, textDecoration: "none" }}>
                    编辑
                  </Link>
                  <Link href={`/admin/announcements/${item.id}/stats`} className="win-btn" style={{ fontSize: 12, padding: "4px 10px", minHeight: 28, textDecoration: "none" }}>
                    统计
                  </Link>
                  <button className="win-btn" style={{ fontSize: 12, padding: "4px 10px", minHeight: 28, color: "var(--win-danger)" }} onClick={() => handleDelete(item)}>
                    删除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 上传文件管理入口 */}
      <Link
        href="/admin/uploads"
        className="win-card"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          marginTop: 16,
          textDecoration: "none",
          color: "var(--win-text)",
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>上传文件管理</div>
          <div style={{ fontSize: 12, color: "var(--win-text-tertiary)", marginTop: 2 }}>
            查看全部图片、清理未引用的孤儿文件、释放磁盘空间
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </Link>
    </div>
  );
}
