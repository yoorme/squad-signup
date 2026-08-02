"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { fetchTags, createTag, updateTag, deleteTag } from "@/lib/tag-api";
import type { TagItem } from "@/types";

// 本组件仅用于赛事表单内的四类赛事标签选择
type TagType = "nature" | "name" | "squadNature" | "map";

interface Props {
  type: TagType;
  // selectedId 为 string；map 类型下传空字符串表示"未选择"
  selectedId: string;
  // 选中某标签时回调其 id；map 类型下回调空字符串表示清空地图
  onSelect: (id: string) => void;
}

const TYPE_LABEL: Record<TagType, string> = {
  nature: "赛事性质",
  name: "赛事名称",
  squadNature: "分队性质",
  map: "赛事地图",
};

export function TagEditor({ type, selectedId, onSelect }: Props) {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(true);
  // 浮窗：编辑/删除某标签
  const [menu, setMenu] = useState<{ tag: TagItem; x: number; y: number } | null>(null);
  const [editName, setEditName] = useState("");
  // 添加新标签
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const toast = useToast();
  const confirm = useConfirm();
  const longPressTimer = useRef<number | null>(null);

  const load = async () => {
    setTags(await fetchTags<TagItem>(type));
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [type]);

  // 长按触发浮窗
  const startLongPress = (tag: TagItem, e: React.TouchEvent) => {
    longPressTimer.current = window.setTimeout(() => {
      const touch = e.touches[0];
      openMenu(tag, touch.clientX, touch.clientY);
    }, 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const openMenu = (tag: TagItem, x: number, y: number) => {
    // 钳制到视口内，避免浮窗溢出
    const maxX = window.innerWidth - 260;
    const maxY = window.innerHeight - 180;
    setMenu({ tag, x: Math.min(x, maxX), y: Math.min(y, maxY) });
    setEditName(tag.name);
  };

  const onContextMenu = (e: React.MouseEvent, tag: TagItem) => {
    e.preventDefault();
    e.stopPropagation();
    openMenu(tag, e.clientX, e.clientY);
  };

  // 保存重命名
  const handleSave = async () => {
    if (!menu) return;
    if (!editName.trim()) {
      toast("名称不能为空", "warning");
      return;
    }
    const data = await updateTag(type, { id: menu.tag.id, name: editName.trim() });
    if (data.ok) {
      toast("已保存", "success");
      setMenu(null);
      load();
    } else {
      toast(data.error || "保存失败", "error");
    }
  };

  // 删除（强制删除：连同使用位置一起清理）
  const handleDelete = async () => {
    if (!menu) return;
    const tag = menu.tag;
    setMenu(null);

    // 根据标签类型生成影响提示
    const impactMsg = (() => {
      if (type === "nature") {
        return `⚠️ 赛事性质字段不可空。若被赛事引用，将拒绝删除（需先改用其他性质）。\n该标签当前被 ${tag.usedCount ?? 0} 个赛事使用。`;
      }
      if (type === "squadNature") {
        return `⚠️ 分队性质字段不可空。若被分队引用，将拒绝删除（需先改用其他性质）。\n该标签当前被 ${tag.usedCount ?? 0} 个分队使用。`;
      }
      if (type === "name" || type === "map") {
        return `引用此标签的赛事将清除该字段（赛事本身保留）。\n该标签当前被 ${tag.usedCount ?? 0} 个赛事使用。`;
      }
      return `已使用此标签的用户将自动移除该标签关联。\n该标签当前被 ${tag.usedCount ?? 0} 个用户使用。`;
    })();

    const yes = await confirm({
      title: "删除标签（完全删除）",
      message: `确定彻底删除「${tag.name}」吗？\n\n${impactMsg}\n\n此操作不可恢复！`,
      confirmText: "确认删除",
      danger: true,
    });
    if (!yes) return;
    const data = await deleteTag(type, tag.id);
    if (data.ok) {
      // 显示级联删除统计（若 API 返回）
      const d = data.data || {};
      const parts: string[] = ["已删除"];
      if (d.cascadeEvents) parts.push(`赛事 ${d.cascadeEvents}`);
      if (d.cascadeSquads) parts.push(`分队 ${d.cascadeSquads}`);
      if (d.cascadeUsers) parts.push(`用户关联 ${d.cascadeUsers}`);
      toast(parts.join("｜"), "success");
      if (selectedId === tag.id) {
        // 删除的是当前选中项，切到第一个可用标签
        const next = tags.find((t) => t.id !== tag.id);
        if (next) onSelect(next.id);
      }
      load();
    } else {
      toast(data.error || "删除失败", "error");
    }
  };

  // 创建新标签
  const handleAdd = async () => {
    if (!newName.trim()) {
      toast("名称不能为空", "warning");
      return;
    }
    const trimmed = newName.trim();
    const data = await createTag(type, { name: trimmed });
    if (data.ok) {
      toast("已添加", "success");
      setNewName("");
      setAdding(false);
      load();
      // 创建后自动选中新标签（API 返回创建的对象）
      if (data.data?.id) onSelect(data.data.id);
    } else {
      toast(data.error || "添加失败", "error");
    }
  };

  // 点击外部关闭浮窗
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    // 延迟绑定，避免触发浮窗的同一 click 立即关闭
    const t = window.setTimeout(() => {
      window.addEventListener("click", close);
      window.addEventListener("scroll", close, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  if (loading) {
    return <div style={{ fontSize: 12, color: "var(--win-text-tertiary)" }}>加载中...</div>;
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {/* 地图类型允许"未知"（清空地图）：用空字符串表示未知状态 */}
      {type === "map" && (
        <span
          className={`win-chip ${selectedId === "" ? "win-chip-accent" : ""}`}
          style={{
            cursor: "pointer",
            fontSize: 12,
            color: selectedId === "" ? "var(--win-accent)" : "var(--win-text-tertiary)",
            userSelect: "none",
          }}
          onClick={() => onSelect("")}
          title="不指定地图"
        >
          未知
        </span>
      )}

      {tags.map((t) => {
        const active = t.id === selectedId;
        return (
          <span
            key={t.id}
            className={`win-chip ${active ? "win-chip-accent" : ""}`}
            style={{
              cursor: "pointer",
              fontSize: 12,
              opacity: t.disabled ? 0.5 : 1,
              textDecoration: t.disabled ? "line-through" : "none",
              userSelect: "none",
            }}
            onClick={() => !t.disabled && onSelect(t.id)}
            onContextMenu={(e) => onContextMenu(e, t)}
            onTouchStart={(e) => startLongPress(t, e)}
            onTouchEnd={cancelLongPress}
            onTouchMove={cancelLongPress}
            title={t.disabled ? `${t.name}（已禁用）长按或右键编辑` : `${t.name} · 长按或右键编辑`}
          >
            {t.name}
            {t.disabled && (
              <span style={{ fontSize: 10, marginLeft: 4, color: "var(--win-danger)" }}>禁</span>
            )}
          </span>
        );
      })}

      {/* 添加新标签：胶囊状 + 号 */}
      {!adding ? (
        <span
          className="win-chip"
          style={{
            cursor: "pointer",
            fontSize: 12,
            color: "var(--win-text-tertiary)",
            borderStyle: "dashed",
          }}
          onClick={() => setAdding(true)}
          title={`新增${TYPE_LABEL[type]}`}
        >
          +
        </span>
      ) : (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <input
            className="win-input"
            style={{ width: 120, minHeight: 28, padding: "2px 8px", fontSize: 12 }}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") { setAdding(false); setNewName(""); }
            }}
            placeholder="新标签名称"
            autoFocus
          />
          <button
            className="win-btn win-btn-primary"
            style={{ fontSize: 11, padding: "2px 8px", minHeight: 26 }}
            onClick={handleAdd}
          >
            添加
          </button>
          <button
            className="win-btn"
            style={{ fontSize: 11, padding: "2px 8px", minHeight: 26 }}
            onClick={() => { setAdding(false); setNewName(""); }}
          >
            取消
          </button>
        </span>
      )}

      {/* 浮窗：保存 / 删除 */}
      {menu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: menu.x,
            top: menu.y,
            zIndex: 1000,
            background: "var(--win-bg-card-solid)",
            border: "1px solid var(--win-border-strong)",
            borderRadius: 8,
            boxShadow: "var(--win-shadow-flyout)",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            width: 240,
          }}
        >
          <div style={{ fontSize: 12, color: "var(--win-text-secondary)", fontWeight: 600 }}>
            编辑{TYPE_LABEL[type]}
          </div>
          <input
            className="win-input"
            style={{ minHeight: 30 }}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") setMenu(null);
            }}
            autoFocus
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              className="win-btn win-btn-danger"
              style={{ fontSize: 12, padding: "4px 12px", minHeight: 28 }}
              onClick={handleDelete}
            >
              删除
            </button>
            <button
              className="win-btn win-btn-primary"
              style={{ fontSize: 12, padding: "4px 12px", minHeight: 28 }}
              onClick={handleSave}
            >
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
