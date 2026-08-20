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
  isArchived: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  commentCount: number;
}

// 公告管理：全部/正常/已归档 tab 切换，支持归档/恢复/编辑/删除
// 已归档公告仅在此处（及公告列表的管理员视图）可见
export default function AdminAnnouncementsPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [filter, setFilter] = useState<"normal" | "archived" | "all">("all");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/announcements?status=${filter}`);
    const data = await res.json();
    if (data.ok) setItems(data.data.announcements);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  // 归档/恢复
  const handleToggleArchive = async (item: AnnouncementItem) => {
    const next = !item.isArchived;
    const yes = await confirm({
      title: next ? "归档公告" : "恢复公告",
      message: next
        ? `归档后「${item.title}」将对普通队员隐藏（仅管理员可见），确定归档吗？`
        : `恢复后「${item.title}」将重新对全体队员可见，确定恢复吗？`,
      confirmText: next ? "归档" : "恢复",
      danger: next,
    });
    if (!yes) return;
    const res = await fetch("/api/announcements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, isArchived: next }),
    });
    const data = await res.json();
    if (data.ok) {
      toast(next ? "已归档" : "已恢复", "success");
      load();
    } else {
      toast(data.error || "操作失败", "error");
    }
  };

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
          <p style={{ fontSize: 13, color: "var(--win-text-secondary)" }}>共 {items.length} 条公告 · 已归档的公告仅管理员可见</p>
        </div>
        <Link href="/admin/announcements/new" className="win-btn win-btn-primary">+ 发布公告</Link>
      </div>

      {/* 状态切换：全部 / 正常 / 已归档 */}
      <div style={{ display: "flex", gap: 4, padding: 4, background: "var(--win-bg-hover)", borderRadius: 6, marginBottom: 16, width: "fit-content" }}>
        {(["all", "normal", "archived"] as const).map((f) => (
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
            {f === "all" ? "全部" : f === "normal" ? "正常" : "已归档"}
          </button>
        ))}
      </div>

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="win-card" style={{ padding: 40, textAlign: "center", color: "var(--win-text-tertiary)" }}>暂无公告</div>
      ) : (
        <div className="win-card" style={{ overflow: "hidden" }}>
          {items.map((item, idx) => (
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
                opacity: item.isArchived ? 0.75 : 1,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  {/* 已归档标签：仅归档的公告展示 */}
                  {item.isArchived && (
                    <span className="win-chip" style={{ fontSize: 11, background: "var(--win-bg-pressed)", color: "var(--win-text-tertiary)", flexShrink: 0 }}>
                      已归档
                    </span>
                  )}
                  <Link
                    href={`/announcements/${item.id}`}
                    style={{ fontSize: 14, fontWeight: 500, color: "var(--win-text)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}
                  >
                    {item.title}
                  </Link>
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--win-text-tertiary)", flexWrap: "wrap" }}>
                  <span>{formatDateTime(item.createdAt)}</span>
                  <span>留言 {item.commentCount}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <Link href={`/admin/announcements/${item.id}/edit`} className="win-btn" style={{ fontSize: 12, padding: "4px 10px", minHeight: 28, textDecoration: "none" }}>
                  编辑
                </Link>
                <button
                  className="win-btn"
                  style={{ fontSize: 12, padding: "4px 10px", minHeight: 28 }}
                  onClick={() => handleToggleArchive(item)}
                >
                  {item.isArchived ? "恢复" : "归档"}
                </button>
                <button className="win-btn" style={{ fontSize: 12, padding: "4px 10px", minHeight: 28, color: "var(--win-danger)" }} onClick={() => handleDelete(item)}>
                  删除
                </button>
              </div>
            </div>
          ))}
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
