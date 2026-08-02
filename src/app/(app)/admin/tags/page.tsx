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
import { Loading, Empty } from "@/components/ui/StateView";
import {
  fetchTags,
  createTag,
  updateTag,
  deleteTag,
  toggleTagDisabled,
  reorderTags,
} from "@/lib/tag-api";
import type { AdminTagItem, TagType } from "@/types";

const TAG_META: Record<TagType, { label: string; hasCategory?: boolean; hasFaction?: boolean; isEventTag?: boolean }> = {
  ability: { label: "能力", hasCategory: true },
  duty: { label: "职责" },
  operator: { label: "干员", hasFaction: true },
  nature: { label: "赛事性质", isEventTag: true },
  name: { label: "赛事名称", isEventTag: true },
  squadNature: { label: "分队性质", isEventTag: true },
  map: { label: "赛事地图", isEventTag: true },
};

// 弹窗表单状态：null=关闭；{ mode: "create" }=新增；{ mode: "edit", target }=编辑
type FormState =
  | { mode: "create" }
  | { mode: "edit"; target: AdminTagItem }
  | null;

export default function AdminTagsPage() {
  const [activeType, setActiveType] = useState<TagType>("ability");
  const [items, setItems] = useState<AdminTagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(null);

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
    setItems(await fetchTags<AdminTagItem>(activeType));
    setLoading(false);
  };

  useEffect(() => { load(); }, [activeType]);

  const openCreate = () => {
    setName("");
    setFaction("");
    setCategory("INFANTRY");
    setForm({ mode: "create" });
  };

  const openEdit = (item: AdminTagItem) => {
    setName(item.name);
    setFaction(item.faction || "");
    setCategory(item.category || "INFANTRY");
    setForm({ mode: "edit", target: item });
  };

  // 新增/编辑共用的提交逻辑
  const handleSubmit = async () => {
    if (!name.trim()) {
      toast("名称不能为空", "warning");
      return;
    }
    if (!form) return;
    const payload = {
      name: name.trim(),
      category: TAG_META[activeType].hasCategory ? category : undefined,
      faction: TAG_META[activeType].hasFaction ? faction.trim() || undefined : undefined,
    };
    const data =
      form.mode === "create"
        ? await createTag(activeType, payload)
        : await updateTag(activeType, { id: form.target.id, ...payload });
    if (data.ok) {
      toast(form.mode === "create" ? "创建成功" : "修改成功", "success");
      setForm(null);
      load();
    } else {
      toast(data.error || (form.mode === "create" ? "创建失败" : "修改失败"), "error");
    }
  };

  // 禁用/启用：禁用后所有人不可在新记录中使用此标签，已使用的不受影响
  const handleToggleDisable = async (item: AdminTagItem) => {
    const next = !item.disabled;
    const data = await toggleTagDisabled(activeType, item.id, next);
    if (data.ok) {
      toast(next ? "已禁用" : "已启用", "success");
      load();
    } else {
      toast(data.error || "操作失败", "error");
    }
  };

  // 删除（强制删除：连同使用位置一起清理）
  const handleDelete = async (item: AdminTagItem) => {
    // 根据标签类型生成影响提示
    const typeLabel = (() => {
      switch (activeType) {
        case "ability": case "duty": case "operator": return "用户标签";
        case "nature": return "赛事性质";
        case "name": return "赛事名称";
        case "squadNature": return "分队性质";
        case "map": return "赛事地图";
        default: return "标签";
      }
    })();

    const impactMsg = (() => {
      if (activeType === "nature") {
        return `⚠️ 若被赛事引用，将级联删除相关赛事（含分队和报名记录）。\n当前被 ${item.usedCount ?? 0} 个赛事使用。`;
      }
      if (activeType === "squadNature") {
        return `⚠️ 若被分队引用，将级联删除相关分队（含报名记录）。\n当前被 ${item.usedCount ?? 0} 个分队使用。`;
      }
      if (activeType === "name" || activeType === "map") {
        return `引用此标签的赛事将把该字段置空（赛事本身不受影响）。\n当前被 ${item.usedCount ?? 0} 个赛事使用。`;
      }
      return `已使用此标签的用户将自动移除关联。\n当前被 ${item.usedCount ?? 0} 个用户使用。`;
    })();

    const yes = await confirm({
      title: `删除${typeLabel}（完全删除）`,
      message: `确定彻底删除「${item.name}」吗？\n\n${impactMsg}\n\n此操作不可恢复！`,
      confirmText: "确认删除",
      cancelText: "取消",
      danger: true,
    });
    if (!yes) return;
    const data = await deleteTag(activeType, item.id);
    if (data.ok) {
      const d = data.data || {};
      const parts: string[] = ["已删除"];
      if (d.cascadeEvents) parts.push(`赛事 ${d.cascadeEvents}`);
      if (d.cascadeSquads) parts.push(`分队 ${d.cascadeSquads}`);
      if (d.cascadeUsers) parts.push(`用户关联 ${d.cascadeUsers}`);
      toast(parts.join("｜"), "success");
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
    const data = await reorderTags(activeType, next.map((i) => i.id));
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
        <button className="win-btn win-btn-primary" onClick={openCreate}>
          + 新增
        </button>
      </div>

      {/* 列表 */}
      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <div className="win-card" style={{ overflow: "hidden" }}>
          <Empty text="暂无标签" />
        </div>
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
                  onEdit={() => openEdit(item)}
                  onToggleDisable={() => handleToggleDisable(item)}
                  onDelete={() => handleDelete(item)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      {/* 新增/编辑共用弹窗 */}
      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={`${form?.mode === "edit" ? "编辑" : "新增"}${TAG_META[activeType].label}`}
        footer={
          <>
            <button className="win-btn" onClick={() => setForm(null)}>取消</button>
            <button className="win-btn win-btn-primary" onClick={handleSubmit}>
              {form?.mode === "edit" ? "保存" : "创建"}
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
              <select className="win-input" value={category} onChange={(e) => setCategory(e.target.value as "INFANTRY" | "VEHICLE")}>
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
          {form?.mode === "edit" && form.target.usedCount > 0 && (
            <div style={{ padding: 12, background: "var(--win-bg-hover)", borderRadius: 8, fontSize: 13, color: "var(--win-text-secondary)" }}>
              该标签已被使用 {form.target.usedCount} 次。修改名称后，所有引用处将自动同步显示新名称（按 ID 关联）。
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
  item: AdminTagItem;
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
