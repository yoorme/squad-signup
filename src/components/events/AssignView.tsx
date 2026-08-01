"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/constants";

interface Ability { id: string; name: string; category: string; }
interface Duty { id: string; name: string; }
interface Member {
  registrationId: string;
  userId: string;
  username: string;
  nickname: string;
  abilities: Ability[];
  duties: Duty[];
}
interface Squad {
  id: string;
  index: number;
  capacity: number;
  nature: { id: string; name: string };
  registeredCount: number;
  members: Member[];
}
interface EventDetail {
  id: string;
  title: string;
  eventTime: string;
  squads: Squad[];
  substitutes: Member[];
}

interface Props {
  eventId: string;
  onClose: () => void;
}

// 管理员分配视图：拖拽队员在分队间、分队与替补间移动
export function AssignView({ eventId, onClose }: Props) {
  const toast = useToast();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/events?id=${encodeURIComponent(eventId)}`);
    const data = await res.json();
    if (data.ok) setEvent(data.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [eventId]);

  // 拖拽结束：把队员移到目标容器（某分队或替补池）
  // 注意：参数名用 dragEvent 避免与 state 变量 event 遮蔽
  const handleDragEnd = async (dragEvent: DragEndEvent) => {
    const { active, over } = dragEvent;
    if (!over) return;
    const regId = String(active.id);
    const targetId = String(over.id); // "sub" 或 squad.id
    const targetSquadId = targetId === "sub" ? null : targetId;

    if (!event) return; // 赛事数据未加载
    // 判断当前所在容器，避免同容器内无意义的移动
    const inSquad = event.squads.find((s) => s.members.some((m) => m.registrationId === regId));
    const currentContainer = inSquad ? inSquad.id : "sub";
    if (currentContainer === targetId) return;

    // 乐观更新：立即从源移除、加入目标
    setEvent((prev) => {
      if (!prev) return prev;
      let member: Member | undefined;
      let squads = prev.squads.map((s) => {
        const idx = s.members.findIndex((m) => m.registrationId === regId);
        if (idx >= 0) {
          member = s.members[idx];
          return { ...s, members: s.members.filter((_, i) => i !== idx), registeredCount: s.registeredCount - 1 };
        }
        return s;
      });
      let substitutes = prev.substitutes;
      const subIdx = prev.substitutes.findIndex((m) => m.registrationId === regId);
      if (subIdx >= 0) {
        member = prev.substitutes[subIdx];
        substitutes = prev.substitutes.filter((_, i) => i !== subIdx);
      }
      if (!member) return prev; // 找不到该队员，不更新
      if (targetSquadId === null) {
        substitutes = [...substitutes, member];
      } else {
        squads = squads.map((s) =>
          s.id === targetSquadId
            ? { ...s, members: [...s.members, member], registeredCount: s.registeredCount + 1 }
            : s
        );
      }
      return { ...prev, squads, substitutes };
    });

    setSaving(true);
    const res = await fetch("/api/events/assign", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationId: regId, targetSquadId }),
    });
    const data = await res.json();
    setSaving(false);
    if (!data.ok) {
      toast(data.error || "分配失败", "error");
      load(); // 回滚
    } else if (!data.unchanged) {
      toast("已调整", "success");
    }
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: 40, color: "var(--win-text-tertiary)" }}>加载中...</div>;
  }
  if (!event) {
    return <div style={{ padding: 24, textAlign: "center", color: "var(--win-text-tertiary)" }}>赛事不存在</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 13, color: "var(--win-text-secondary)" }}>
          拖拽队员卡片在分队间移动 · {formatDateTime(event.eventTime)}
          {saving && <span style={{ marginLeft: 8, color: "var(--win-accent)" }}>保存中...</span>}
        </div>
        <button className="win-btn" style={{ fontSize: 12, padding: "4px 12px", minHeight: 28 }} onClick={onClose}>
          关闭
        </button>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {event.squads.map((s) => (
            <SquadColumn key={s.id} squad={s} />
          ))}
        </div>

        {/* 替补池 */}
        <SubstituteColumn substitutes={event.substitutes} />
      </DndContext>
    </div>
  );
}

// 分队列：可放置区域 + 队员卡片
function SquadColumn({ squad }: { squad: Squad }) {
  const { setNodeRef, isOver } = useDroppable({ id: squad.id });
  const full = squad.registeredCount >= squad.capacity;

  return (
    <div
      ref={setNodeRef}
      style={{
        background: isOver ? "var(--win-bg-selected)" : "var(--win-bg-hover)",
        border: `2px dashed ${isOver ? "var(--win-accent)" : full ? "var(--win-danger)" : "var(--win-border)"}`,
        borderRadius: 8,
        padding: 12,
        minHeight: 120,
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          第 {squad.index} 队 · {squad.nature.name}
        </span>
        <span style={{ fontSize: 11, color: full ? "var(--win-danger)" : "var(--win-text-tertiary)" }}>
          {squad.registeredCount}/{squad.capacity}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {squad.members.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--win-text-tertiary)", textAlign: "center", padding: 12 }}>
            拖拽队员到此
          </div>
        ) : (
          squad.members.map((m) => <MemberCard key={m.registrationId} member={m} />)
        )}
      </div>
    </div>
  );
}

// 替补池：可放置区域
function SubstituteColumn({ substitutes }: { substitutes: Member[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: "sub" });

  return (
    <div
      ref={setNodeRef}
      style={{
        background: isOver ? "var(--win-bg-selected)" : "var(--win-bg-hover)",
        border: `2px dashed ${isOver ? "var(--win-accent)" : "var(--win-border)"}`,
        borderRadius: 8,
        padding: 12,
        minHeight: 80,
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>替补池</span>
        <span style={{ fontSize: 11, color: "var(--win-text-tertiary)" }}>{substitutes.length} 人</span>
      </div>
      {substitutes.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--win-text-tertiary)", textAlign: "center", padding: 12 }}>
          拖拽队员到此降为替补
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {substitutes.map((m) => <MemberCard key={m.registrationId} member={m} />)}
        </div>
      )}
    </div>
  );
}

// 队员卡片：可拖拽
function MemberCard({ member }: { member: Member }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: member.registrationId });
  const duty = member.duties.find((d) => d.name !== "无");
  const abilityLabels = member.abilities.map((a) => a.name).slice(0, 3);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        background: "var(--win-bg-card-solid)",
        border: "1px solid var(--win-border)",
        borderRadius: 6,
        padding: "6px 10px",
        cursor: "grab",
        opacity: isDragging ? 0.4 : 1,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        touchAction: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{member.nickname}</span>
        {duty && (
          <span style={{ fontSize: 10, color: "var(--win-warning)" }}>{duty.name}</span>
        )}
      </div>
      {abilityLabels.length > 0 && (
        <div style={{ fontSize: 10, color: "var(--win-text-tertiary)", marginTop: 2 }}>
          {abilityLabels.join("·")}
        </div>
      )}
    </div>
  );
}
