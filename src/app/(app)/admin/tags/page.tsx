"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { Modal } from "@/components/ui/Modal";

type TagType = "ability" | "duty" | "operator" | "nature" | "name" | "squadNature" | "map";

interface TagItem {
  id: string;
  name: string;
  category?: "INFANTRY" | "VEHICLE";
  faction?: string | null;
  sortOrder: number;
  usedCount: number;
  disabled?: boolean;
}

const TAG_META: Record<TagType, { label: string; hasCategory?: boolean; hasFaction?: boolean; isEventTag?: boolean }> = {
  ability: { label: "能力", hasCategory: true },
  duty: { label: "职责" },
  operator: { label: "干员", hasFaction: true },
  nature: { label: "赛事性质", isEventTag: true },
  name: { label: "赛事名称", isEventTag: true },
  squadNature: { label: "分队性质", isEventTag: true },
  map: { label: "赛事地图", isEventTag: true },
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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

  const handleUpdate = async (item: TagItem, newName: string, newCategory?: string, newFaction?: string) => {
    const res = await fetch("/api/admin/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: activeType,
        op: "update",
        id: item.id,
        name: newName.trim(),
        category: TAG_META[activeType].hasCategory ? newCategory : undefined,
        faction: TAG_META[activeType].hasFaction ? newFaction : undefined,
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

  // 禁用/启用：禁用后所有人不可在新记录中使用此标签，已使用的不受影响
  const handleToggleDisable = async (item: TagItem) => {
    const next = !item.disabled;
    const res = await fetch("/api/admin/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: activeType, op: "toggleDisable", id: item.id, disabled: next }),
    });
    const data = await res.json();
    if (data.ok) {
      toast(next ? "已禁用" : "已启用", "success");
      load();
    } else {
      toast(data.error || "操作失败", "error");
    }
  };

  // 删除：同步删除，仅确认/取消。被使用的标签无法删除，提示改用禁用。
  const handleDelete = async (item: TagItem) => {
    const yes = await confirm({
      title: "删除标签",
      message: `确定要删除「${item.name}」吗？被使用的标签无法删除，请改用「禁用」。`,
      confirmText: "确认",
      cancelText: "取消",
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

  // 拖拽结束：本地立即更新顺序，异步持久化到服务端
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    const res = await fetch("/api/admin/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: activeType, op: "reorder", orderedIds: next.map((i) => i.id) }),
    });
    const data = await res.json();
    if (!data.ok) {
      toast(data.error || "排序失败", "error");
      load();
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
        管理能力、职责、干员、赛事性质、赛事名称、分队性质、赛事地图等标签 · 拖拽手柄调整展示顺序 · 禁用后不可新用，已使用的不受影响
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
        <button className="win-btn win-btn-primary" onClick={() => { setName(""); setFaction(""); setCategory("INFANTRY"); setCreateOpen(true); }}>
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {items.map((item, idx) => (
                <SortableTagRow
                  key={item.id}
                  item={item}
                  isLast={idx === items.length - 1}
                  onEdit={() => {
                    setEditTarget(item);
                    setName(item.name);
                    setFaction(item.faction || "");
                    setCategory(item.category || "INFANTRY");
                  }}
                  onToggleDisable={() => handleToggleDisable(item)}
                  onDelete={() => handleDelete(item)}
                />
              ))}
            </SortableContext>
          </DndContext>
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
              onClick={() => editTarget && handleUpdate(editTarget, name, category, faction)}
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
              <input className="win-input" value={faction} onChange={(e) => setFaction(e.target.value)} />
            </div>
          )}
          {editTarget && editTarget.usedCount > 0 && (
            <div style={{ padding: 12, background: "var(--win-bg-hover)", borderRadius: 8, fontSize: 13, color: "var(--win-text-secondary)" }}>
              该标签已被使用 {editTarget.usedCount} 次。修改名称后，所有引用处将自动同步显示新名称（按 ID 关联）。
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

// 可拖拽的标签行：左侧拖拽手柄 + 标签信息 + 操作按钮
function SortableTagRow({
  item,
  isLast,
  onEdit,
  onToggleDisable,
  onDelete,
}: {
  item: TagItem;
  isLast: boolean;
  onEdit: () => void;
  onToggleDisable: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 16px",
        borderBottom: isLast ? "none" : "1px solid var(--win-border)",
        opacity: item.disabled ? 0.6 : 1,
        background: isDragging ? "var(--win-bg-selected)" : undefined,
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
        {/* 拖拽手柄 */}
        <span
          {...attributes}
          {...listeners}
          style={{
            cursor: "grab",
            color: "var(--win-text-tertiary)",
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            padding: 2,
            touchAction: "none",
          }}
          title="拖拽调整顺序"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
          </svg>
        </span>
        <span style={{ fontSize: 14, fontWeight: 500, textDecoration: item.disabled ? "line-through" : "none" }}>
          {item.name}
        </span>
        {item.category && (
          <span className="win-chip" style={{ fontSize: 11 }}>
            {item.category === "INFANTRY" ? "步兵" : "载具"}
          </span>
        )}
        {item.faction && (
          <span className="win-chip" style={{ fontSize: 11 }}>{item.faction}</span>
        )}
        {item.disabled && (
          <span className="win-chip" style={{ fontSize: 11, background: "rgba(209,52,56,0.1)", color: "var(--win-danger)", borderColor: "var(--win-danger)" }}>
            已禁用
          </span>
        )}
        <span style={{ fontSize: 11, color: "var(--win-text-tertiary)" }}>
          已使用 {item.usedCount}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          className="win-btn"
          style={{ fontSize: 12, padding: "4px 10px", minHeight: 26 }}
          onClick={onEdit}
        >
          编辑
        </button>
        <button
          className="win-btn"
          style={{ fontSize: 12, padding: "4px 10px", minHeight: 26, color: item.disabled ? "var(--win-success)" : "var(--win-warning)" }}
          onClick={onToggleDisable}
        >
          {item.disabled ? "启用" : "禁用"}
        </button>
        <button
          className="win-btn"
          style={{ fontSize: 12, padding: "4px 10px", minHeight: 26, color: "var(--win-danger)" }}
          onClick={onDelete}
        >
          删除
        </button>
      </div>
    </div>
  );
}
