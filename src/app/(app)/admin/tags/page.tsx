"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { Modal } from "@/components/ui/Modal";

type TagType = "ability" | "duty" | "operator" | "nature" | "name" | "squadNature";

interface TagItem {
  id: string;
  name: string;
  category?: "INFANTRY" | "VEHICLE";
  faction?: string | null;
  sortOrder: number;
  usedCount: number;
}

const TAG_META: Record<TagType, { label: string; hasCategory?: boolean; hasFaction?: boolean; isEventTag?: boolean }> = {
  ability: { label: "能力", hasCategory: true },
  duty: { label: "职责" },
  operator: { label: "干员", hasFaction: true },
  nature: { label: "赛事性质", isEventTag: true },
  name: { label: "赛事名称", isEventTag: true },
  squadNature: { label: "分队性质", isEventTag: true },
};

export default function AdminTagsPage() {
  const [activeType, setActiveType] = useState<TagType>("ability");
  const [items, setItems] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TagItem | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<"INFANTRY" | "VEHICLE">("INFANTRY");
  const [faction, setFaction] = useState("");

  const toast = useToast();
  const confirm = useConfirm();

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/tags?type=${activeType}`);
    const data = await res.json();
    if (data.ok) setItems(data.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [activeType]);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast("名称不能为空", "warning");
      return;
    }
    const res = await fetch("/api/admin/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: activeType,
        op: "create",
        name: name.trim(),
        category: TAG_META[activeType].hasCategory ? category : undefined,
        faction: TAG_META[activeType].hasFaction ? faction.trim() || undefined : undefined,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      toast("创建成功", "success");
      setCreateOpen(false);
      setName("");
      setFaction("");
      load();
    } else {
      toast(data.error || "创建失败", "error");
    }
  };

  const handleUpdate = async (item: TagItem, newName: string, newFaction?: string) => {
    // 检查是否需要询问同步历史赛事
    if (TAG_META[activeType].isEventTag && item.usedCount > 0) {
      const yes = await confirm({
        title: "同步修改历史赛事？",
        message: (
          <div>
            <div style={{ marginBottom: 8 }}>该标签已被 <b>{item.usedCount}</b> 个赛事使用。</div>
            <div>是否同步修改历史赛事中的此标签？</div>
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--win-text-tertiary)" }}>
              · 选择「同步」：历史赛事中的标签也会重命名<br/>
              · 选择「取消」：放弃本次修改
            </div>
          </div>
        ),
        confirmText: "同步修改",
        cancelText: "取消",
      });
      if (!yes) return;
    }

    const res = await fetch("/api/admin/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: activeType,
        op: "update",
        id: item.id,
        name: newName.trim(),
        faction: newFaction,
        syncHistory: true,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      toast("修改成功", "success");
      setEditTarget(null);
      load();
    } else {
      toast(data.error || "修改失败", "error");
    }
  };

  const handleDelete = async (item: TagItem) => {
    if (TAG_META[activeType].isEventTag && item.usedCount > 0) {
      // 询问是否同步从历史赛事移除
      const sync = await confirm({
        title: "删除标签",
        message: (
          <div>
            <div style={{ marginBottom: 8 }}>该标签已被 <b>{item.usedCount}</b> 个赛事使用。</div>
            <div>是否同时从历史赛事中移除此标签？</div>
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--win-text-tertiary)" }}>
              · 选择「同步移除」：历史赛事中的标签会被移除<br/>
              · 选择「取消」：放弃删除
            </div>
          </div>
        ),
        confirmText: "同步移除",
        cancelText: "取消",
        danger: true,
      });
      if (!sync) return;

      // 注意：当前实现下，删除标签会导致关联赛事的引用变无效。
      // SQLite 不支持级联 SET NULL（仅支持 CASCADE），所以我们改为先把关联断开。
      // 这里简化处理：直接调用删除，由前端逻辑保证（生产环境应进一步处理）
      const res = await fetch("/api/admin/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: activeType, op: "delete", id: item.id, syncHistory: true }),
      });
      const data = await res.json();
      if (data.ok) {
        toast("已删除", "success");
        load();
      } else {
        toast(data.error || "删除失败", "error");
      }
      return;
    }

    // 普通删除
    const yes = await confirm({
      title: "删除标签",
      message: `确定要删除「${item.name}」吗？`,
      confirmText: "删除",
      danger: true,
    });
    if (!yes) return;
    const res = await fetch("/api/admin/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: activeType, op: "delete", id: item.id }),
    });
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

      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>标签维护</h1>
      <p style={{ fontSize: 13, color: "var(--win-text-secondary)", marginBottom: 24 }}>
        管理各类标签，支持增加、修改、删除
      </p>

      {/* 类型切换 */}
      <div style={{ display: "flex", gap: 4, padding: 4, background: "var(--win-bg-hover)", borderRadius: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(Object.keys(TAG_META) as TagType[]).map((t) => (
          <button
            key={t}
            onClick={() => setActiveType(t)}
            style={{
              padding: "8px 14px",
              borderRadius: 4,
              border: "none",
              background: activeType === t ? "var(--win-bg-card-solid)" : "transparent",
              color: activeType === t ? "var(--win-accent)" : "var(--win-text-secondary)",
              fontSize: 13,
              cursor: "pointer",
              fontWeight: activeType === t ? 600 : 400,
              boxShadow: activeType === t ? "var(--win-shadow-card)" : "none",
            }}
          >
            {TAG_META[t].label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>{TAG_META[activeType].label}列表（{items.length}）</h2>
        <button className="win-btn win-btn-primary" onClick={() => { setName(""); setFaction(""); setCreateOpen(true); }}>
          + 新增
        </button>
      </div>

      {/* 列表 */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--win-text-tertiary)" }}>加载中...</div>
      ) : items.length === 0 ? (
        <div className="win-card" style={{ padding: 40, textAlign: "center", color: "var(--win-text-tertiary)" }}>暂无标签</div>
      ) : (
        <div className="win-card" style={{ overflow: "hidden" }}>
          {items.map((item, idx) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 16px",
                borderBottom: idx === items.length - 1 ? "none" : "1px solid var(--win-border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{item.name}</span>
                {item.category && (
                  <span className="win-chip" style={{ fontSize: 11 }}>
                    {item.category === "INFANTRY" ? "步兵" : "载具"}
                  </span>
                )}
                {item.faction && (
                  <span className="win-chip" style={{ fontSize: 11 }}>{item.faction}</span>
                )}
                <span style={{ fontSize: 11, color: "var(--win-text-tertiary)" }}>
                  已使用 {item.usedCount}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                  className="win-btn"
                  style={{ fontSize: 12, padding: "4px 10px", minHeight: 26 }}
                  onClick={() => { setEditTarget(item); setName(item.name); setFaction(item.faction || ""); setCategory(item.category || "INFANTRY"); }}
                >
                  编辑
                </button>
                <button
                  className="win-btn"
                  style={{ fontSize: 12, padding: "4px 10px", minHeight: 26, color: "var(--win-danger)" }}
                  onClick={() => handleDelete(item)}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 创建弹窗 */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={`新增${TAG_META[activeType].label}`}
        footer={
          <>
            <button className="win-btn" onClick={() => setCreateOpen(false)}>取消</button>
            <button className="win-btn win-btn-primary" onClick={handleCreate}>创建</button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="win-label">名称</label>
            <input className="win-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          {TAG_META[activeType].hasCategory && (
            <div>
              <label className="win-label">方向</label>
              <select className="win-input" value={category} onChange={(e) => setCategory(e.target.value as any)}>
                <option value="INFANTRY">步兵方向</option>
                <option value="VEHICLE">载具方向</option>
              </select>
            </div>
          )}
          {TAG_META[activeType].hasFaction && (
            <div>
              <label className="win-label">阵营（可选）</label>
              <input className="win-input" value={faction} onChange={(e) => setFaction(e.target.value)} placeholder="如：攻方" />
            </div>
          )}
        </div>
      </Modal>

      {/* 编辑弹窗 */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={`编辑${TAG_META[activeType].label}`}
        footer={
          <>
            <button className="win-btn" onClick={() => setEditTarget(null)}>取消</button>
            <button
              className="win-btn win-btn-primary"
              onClick={() => editTarget && handleUpdate(editTarget, name, faction)}
            >
              保存
            </button>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="win-label">名称</label>
            <input className="win-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          {TAG_META[activeType].hasFaction && (
            <div>
              <label className="win-label">阵营（可选）</label>
              <input className="win-input" value={faction} onChange={(e) => setFaction(e.target.value)} />
            </div>
          )}
          {editTarget && TAG_META[activeType].isEventTag && editTarget.usedCount > 0 && (
            <div style={{ padding: 12, background: "var(--win-bg-hover)", borderRadius: 8, fontSize: 13, color: "var(--win-warning)" }}>
              该标签已被 {editTarget.usedCount} 个赛事使用，保存时会询问是否同步修改历史赛事。
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
