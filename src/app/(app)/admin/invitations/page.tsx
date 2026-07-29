"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { Modal } from "@/components/ui/Modal";
import { formatDateTime } from "@/lib/constants";

interface Invitation {
  id: string;
  code: string;
  maxUses: number;
  usedCount: number;
  remaining: number;
  createdAt: string;
  createdBy: { username: string; nickname: string };
}

export default function AdminInvitationsPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [items, setItems] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [maxUses, setMaxUses] = useState(10);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/invitations");
    const data = await res.json();
    if (data.ok) setItems(data.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!Number.isInteger(maxUses) || maxUses <= 0) {
      toast("次数必须是正整数", "warning");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/admin/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxUses }),
    });
    const data = await res.json();
    setCreating(false);
    if (data.ok) {
      toast("邀请码已生成", "success");
      setCreateOpen(false);
      load();
    } else {
      toast(data.error || "生成失败", "error");
    }
  };

  const handleDelete = async (item: Invitation) => {
    const yes = await confirm({
      title: "删除邀请码",
      message: `确定要删除邀请码「${item.code}」吗？删除后该码将无法用于注册。`,
      danger: true,
    });
    if (!yes) return;
    const res = await fetch(`/api/admin/invitations?id=${item.id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      toast("已删除", "success");
      load();
    } else {
      toast(data.error || "删除失败", "error");
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard?.writeText(code);
    toast("已复制", "success");
  };

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <Link href="/admin" style={{ fontSize: 13, color: "var(--win-text-secondary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        返回管理首页
      </Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>邀请码管理</h1>
          <p style={{ fontSize: 13, color: "var(--win-text-secondary)" }}>
            生成邀请码供新队员注册
          </p>
        </div>
        <button className="win-btn win-btn-primary" onClick={() => setCreateOpen(true)}>+ 生成邀请码</button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--win-text-tertiary)" }}>加载中...</div>
      ) : items.length === 0 ? (
        <div className="win-card" style={{ padding: 40, textAlign: "center", color: "var(--win-text-tertiary)" }}>暂无邀请码</div>
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
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
                <code
                  style={{
                    fontFamily: "Consolas, monospace",
                    fontSize: 16,
                    fontWeight: 600,
                    letterSpacing: 1,
                    padding: "4px 10px",
                    background: "var(--win-bg-hover)",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                  onClick={() => handleCopy(item.code)}
                  title="点击复制"
                >
                  {item.code}
                </code>
                <span style={{ fontSize: 12, color: "var(--win-text-secondary)" }}>
                  {item.usedCount}/{item.maxUses} 已用
                </span>
                {item.remaining > 0 ? (
                  <span className="win-chip" style={{ fontSize: 11, background: "var(--win-bg-selected)", color: "var(--win-success)", borderColor: "var(--win-success)" }}>
                    剩 {item.remaining}
                  </span>
                ) : (
                  <span className="win-chip" style={{ fontSize: 11, background: "rgba(209,52,56,0.1)", color: "var(--win-danger)", borderColor: "var(--win-danger)" }}>
                    已用尽
                  </span>
                )}
                <span style={{ fontSize: 11, color: "var(--win-text-tertiary)" }}>
                  {item.createdBy.username} · {formatDateTime(item.createdAt)}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button className="win-btn" style={{ fontSize: 12, padding: "4px 10px", minHeight: 28 }} onClick={() => handleCopy(item.code)}>
                  复制
                </button>
                <button className="win-btn" style={{ fontSize: 12, padding: "4px 10px", minHeight: 28, color: "var(--win-danger)" }} onClick={() => handleDelete(item)}>
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="生成邀请码"
        footer={
          <>
            <button className="win-btn" onClick={() => setCreateOpen(false)}>取消</button>
            <button className="win-btn win-btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? "生成中..." : "生成"}
            </button>
          </>
        }
      >
        <div>
          <label className="win-label">可用次数</label>
          <input
            className="win-input"
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(Number(e.target.value))}
            autoFocus
          />
          <p style={{ fontSize: 12, color: "var(--win-text-tertiary)", marginTop: 8 }}>
            每位新队员注册时消耗 1 次，次数用尽后邀请码失效。
          </p>
        </div>
      </Modal>
    </div>
  );
}
