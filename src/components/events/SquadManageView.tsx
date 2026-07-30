"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useToast } from "@/components/ui/Toast";

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
  status: "UPCOMING" | "ARCHIVED";
  requiredCount: number;
  format: "BO3" | "BO5" | "R2" | null;
  nature: { id: string; name: string };
  name: { id: string; name: string };
  squads: Squad[];
  substitutes: Member[];
  totalRegistered: number;
  totalSubstitutes: number;
  myRegistration: { squadId: string | null; isSubstitute: boolean } | null;
  version?: string;
}

interface Props {
  event: EventDetail;
  onChanged: () => void;
  disabled?: boolean;
}

const DOUBLE_GAP = 32; // 分队区与替补区的间隔

export function SquadManageView({ event, onChanged, disabled }: Props) {
  const toast = useToast();
  const [movingId, setMovingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const registrationId = String(active.id);
    const targetSquadId = over.id === "substitutes" ? null : String(over.id);

    // 找到拖拽开始时队员所在分队 ID（用于乐观锁检测中间状态变化）
    let expectedSquadId: string | null = null;
    for (const s of event.squads) {
      if (s.members.some((m) => m.registrationId === registrationId)) {
        expectedSquadId = s.id;
        break;
      }
    }
    // 若在替补区找到，expectedSquadId 保持 null
    if (expectedSquadId === targetSquadId) return;

    setMovingId(registrationId);
    try {
      const res = await fetch("/api/events/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId, targetSquadId, expectedSquadId }),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.data?.unchanged) {
          // 位置未变，静默
        } else {
          toast("已移动", "success");
        }
        onChanged();
      } else {
        const err = String(data.error || "移动失败");
        // 409 冲突 / 410 已取消：强制刷新，提示用户
        if (res.status === 409 || res.status === 410) {
          toast(err, "warning");
          onChanged(); // 拉取最新状态
        } else {
          toast(err, "error");
        }
      }
    } catch {
      toast("网络异常，请重试", "error");
    } finally {
      setMovingId(null);
    }
  };

  return (
    <div className="win-card" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>分队管理</h2>
        <span style={{ fontSize: 12, color: "var(--win-text-tertiary)" }}>
          {disabled ? "赛事已结束，无法调整" : "拖动成员 chip 到目标分队或替补 · 每 15s 自动同步"}
        </span>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {/* 表头 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              padding: "8px 12px",
              borderBottom: "2px solid var(--win-border)",
              fontSize: 12,
              color: "var(--win-text-secondary)",
              fontWeight: 600,
            }}
          >
            <div>分队性质</div>
            <div>成员（拖动调整）</div>
          </div>

          {/* 分队行 */}
          {event.squads.map((s) => (
            <SquadRow
              key={s.id}
              squad={s}
              disabled={!!disabled || !!movingId}
            />
          ))}

          {/* 2 倍间隔 */}
          <div style={{ height: DOUBLE_GAP }} />

          {/* 替补行 */}
          <SubstituteRow
            substitutes={event.substitutes}
            disabled={!!disabled || !!movingId}
          />
        </div>
      </DndContext>
    </div>
  );
}

function SquadRow({ squad, disabled }: { squad: Squad; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: squad.id });
  const full = squad.members.length >= squad.capacity;

  return (
    <div
      ref={setNodeRef}
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        padding: 12,
        borderBottom: "1px solid var(--win-border)",
        alignItems: "flex-start",
        background: isOver ? (full ? "rgba(209, 52, 56, 0.08)" : "var(--win-bg-selected)") : "transparent",
        transition: "background 0.15s",
        minHeight: 60,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="win-chip" style={{ alignSelf: "flex-start", fontSize: 12 }}>
          {squad.nature.name}
        </span>
        <span style={{ fontSize: 11, color: "var(--win-text-tertiary)" }}>
          第 {squad.index} 队
        </span>
        <span style={{ fontSize: 11, color: full ? "var(--win-success)" : "var(--win-text-tertiary)", fontWeight: 600 }}>
          {squad.members.length}/{squad.capacity} {full && "·满"}
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", minHeight: 32 }}>
        {squad.members.length === 0 ? (
          <span style={{ fontSize: 13, color: "var(--win-text-tertiary)", padding: 8 }}>拖入队员</span>
        ) : (
          squad.members.map((m) => (
            <DraggableMemberChip key={m.registrationId} member={m} disabled={disabled} />
          ))
        )}
      </div>
    </div>
  );
}

function SubstituteRow({ substitutes, disabled }: { substitutes: Member[]; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "substitutes" });

  return (
    <div
      ref={setNodeRef}
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        padding: 12,
        borderTop: "2px solid var(--win-border)",
        alignItems: "flex-start",
        background: isOver ? "var(--win-bg-selected)" : "transparent",
        transition: "background 0.15s",
        minHeight: 60,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="win-chip" style={{ alignSelf: "flex-start", fontSize: 12, background: "var(--win-bg-pressed)", borderColor: "var(--win-border-strong)" }}>
          替补
        </span>
        <span style={{ fontSize: 11, color: "var(--win-text-tertiary)" }}>{substitutes.length} 人 · 无上限</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", minHeight: 32 }}>
        {substitutes.length === 0 ? (
          <span style={{ fontSize: 13, color: "var(--win-text-tertiary)", padding: 8 }}>暂无替补</span>
        ) : (
          substitutes.map((m) => (
            <DraggableMemberChip key={m.registrationId} member={m} disabled={disabled} />
          ))
        )}
      </div>
    </div>
  );
}

function DraggableMemberChip({ member, disabled }: { member: Member; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: member.registrationId,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.6 : 1,
    cursor: disabled ? "default" : "grab",
    zIndex: isDragging ? 1000 : "auto",
  };

  const duty = member.duties.find((d) => d.name !== "无");
  const abilityLabels = member.abilities.map((a) => a.name).slice(0, 3);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "6px 12px",
        borderRadius: 16,
        background: "var(--win-bg-card-solid)",
        border: "1px solid var(--win-border-strong)",
        fontSize: 12,
        color: "var(--win-text)",
        boxShadow: "var(--win-shadow-card)",
        userSelect: "none",
        touchAction: "none",
      }}
      {...attributes}
      {...listeners}
    >
      <span style={{ fontWeight: 500 }}>{member.nickname}</span>
      {duty && (
        <span style={{ fontSize: 10, color: "var(--win-warning)", padding: "0 4px", borderLeft: "1px solid var(--win-border)" }}>
          {duty.name}
        </span>
      )}
      {abilityLabels.length > 0 && (
        <span style={{ fontSize: 10, color: "var(--win-text-tertiary)", padding: "0 0 0 4px", borderLeft: "1px solid var(--win-border)" }}>
          {abilityLabels.join("·")}
        </span>
      )}
    </div>
  );
}
