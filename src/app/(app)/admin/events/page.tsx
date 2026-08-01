"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { formatDateTime } from "@/lib/constants";
import { TagEditor } from "@/components/events/TagEditor";

interface Squad {
  id: string;
  index: number;
  capacity: number;
  nature: { id: string; name: string };
  registeredCount: number;
}
interface EventItem {
  id: string;
  title: string;
  eventTime: string;
  status: "UPCOMING" | "ARCHIVED";
  requiredCount: number;
  format: "BO3" | "BO5" | "R2" | null;
  nature: { id: string; name: string };
  name: { id: string; name: string };
  map: { id: string; name: string } | null;
  squads: Squad[];
}

export default function AdminEventsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/events?status=ALL");
    const data = await res.json();
    if (data.ok) setEvents(data.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleArchiveToggle = async (ev: EventItem) => {
    const next = ev.status === "ARCHIVED" ? "UPCOMING" : "ARCHIVED";
    const res = await fetch("/api/events/manage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ev.id, status: next }),
    });
    const data = await res.json();
    if (data.ok) {
      toast(ev.status === "ARCHIVED" ? "已恢复" : "已归档", "success");
      load();
    } else {
      toast(data.error || "操作失败", "error");
    }
  };

  const handleDelete = async (ev: EventItem) => {
    const yes = await confirm({
      title: "删除赛事",
      message: `确定删除「${ev.title}」吗？所有报名记录将一并删除，无法恢复。`,
      confirmText: "删除",
      danger: true,
    });
    if (!yes) return;
    const res = await fetch(`/api/events/manage?id=${ev.id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      toast("已删除", "success");
      load();
    } else {
      toast(data.error || "删除失败", "error");
    }
  };

  // 保存赛事标签/赛制/分队性质/地图
  const handleSaveEdit = async (
    ev: EventItem,
    patch: { natureId?: string; nameId?: string; mapId?: string | null; format?: "BO3" | "BO5" | "R2" | null; squads?: { id: string; natureId: string }[] }
  ) => {
    const res = await fetch("/api/events/manage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ev.id, ...patch }),
    });
    const data = await res.json();
    if (data.ok) {
      toast("已保存", "success");
      load();
    } else {
      toast(data.error || "保存失败", "error");
    }
  };

  return (
    <div style={{ maxWidth: 920, margin: "0 auto" }}>
      <Link
        href="/admin"
        style={{
          fontSize: 13,
          color: "var(--win-text-secondary)",
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          marginBottom: 12,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        返回管理首页
      </Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>赛事管理</h1>
          <p style={{ fontSize: 13, color: "var(--win-text-secondary)", marginTop: 4 }}>
            修改赛事标签、赛制与分队性质 · 标签可长按或右键编辑/删除
          </p>
        </div>
        <Link href="/admin/events/new" className="win-btn win-btn-primary" style={{ fontSize: 13 }}>
          + 创建赛事
        </Link>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--win-text-tertiary)" }}>加载中...</div>
      ) : events.length === 0 ? (
        <div className="win-card" style={{ padding: 40, textAlign: "center", color: "var(--win-text-tertiary)" }}>
          暂无赛事
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {events.map((ev) => (
            <EventEditCard
              key={ev.id}
              ev={ev}
              editing={editingId === ev.id}
              onToggleEdit={() => setEditingId(editingId === ev.id ? null : ev.id)}
              onSave={handleSaveEdit}
              onArchiveToggle={() => handleArchiveToggle(ev)}
              onDelete={() => handleDelete(ev)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EventEditCard({
  ev,
  editing,
  onToggleEdit,
  onSave,
  onArchiveToggle,
  onDelete,
}: {
  ev: EventItem;
  editing: boolean;
  onToggleEdit: () => void;
  onSave: (ev: EventItem, patch: any) => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
}) {
  const [natureId, setNatureId] = useState(ev.nature.id);
  const [nameId, setNameId] = useState(ev.name.id);
  const [mapId, setMapId] = useState(ev.map?.id ?? "");
  const [format, setFormat] = useState<"BO3" | "BO5" | "R2" | null>(ev.format);
  const [squadNatures, setSquadNatures] = useState<Record<string, string>>(
    Object.fromEntries(ev.squads.map((s) => [s.id, s.nature.id]))
  );

  // 切换编辑对象时重置本地状态
  useEffect(() => {
    setNatureId(ev.nature.id);
    setNameId(ev.name.id);
    setMapId(ev.map?.id ?? "");
    setFormat(ev.format);
    setSquadNatures(Object.fromEntries(ev.squads.map((s) => [s.id, s.nature.id])));
  }, [ev.id, ev.nature.id, ev.name.id, ev.map?.id, ev.format]);

  const isArchived = ev.status === "ARCHIVED";

  const dirty =
    natureId !== ev.nature.id ||
    nameId !== ev.name.id ||
    mapId !== (ev.map?.id ?? "") ||
    format !== ev.format ||
    ev.squads.some((s) => squadNatures[s.id] !== s.nature.id);

  return (
    <div className="win-card" style={{ padding: 16 }}>
      {/* 头部 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            <span className="win-chip" style={{ fontSize: 11 }}>{ev.nature.name}</span>
            <span className="win-chip" style={{ fontSize: 11 }}>{ev.name.name}</span>
            {ev.map && (
              <span className="win-chip" style={{ fontSize: 11 }}>{ev.map.name}</span>
            )}
            {ev.format && (
              <span className="win-chip" style={{ fontSize: 11, background: "var(--win-bg-selected)", color: "var(--win-accent)", borderColor: "var(--win-accent)" }}>
                {ev.format}
              </span>
            )}
            <span className="win-chip" style={{ fontSize: 11, background: isArchived ? "var(--win-bg-pressed)" : "transparent", color: isArchived ? "var(--win-text-tertiary)" : "var(--win-success)" }}>
              {isArchived ? "已结束" : "进行中"}
            </span>
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{ev.title}</h3>
          <div style={{ fontSize: 12, color: "var(--win-text-secondary)" }}>{formatDateTime(ev.eventTime)}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button className="win-btn" style={{ fontSize: 12, padding: "4px 10px", minHeight: 28 }} onClick={onToggleEdit}>
            {editing ? "收起" : "编辑"}
          </button>
          <button className="win-btn win-btn-secondary" style={{ fontSize: 12, padding: "4px 10px", minHeight: 28 }} onClick={onArchiveToggle}>
            {isArchived ? "恢复" : "归档"}
          </button>
          <button className="win-btn win-btn-danger" style={{ fontSize: 12, padding: "4px 10px", minHeight: 28 }} onClick={onDelete}>
            删除
          </button>
        </div>
      </div>

      {/* 编辑区 */}
      {editing && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--win-border)", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label className="win-label">赛事性质（长按或右键标签编辑/删除，+ 新增）</label>
            <TagEditor type="nature" selectedId={natureId} onSelect={setNatureId} />
          </div>
          <div>
            <label className="win-label">赛事名称</label>
            <TagEditor type="name" selectedId={nameId} onSelect={setNameId} />
          </div>
          <div>
            <label className="win-label">赛事地图（可选，点击「未知」清空）</label>
            <TagEditor type="map" selectedId={mapId} onSelect={setMapId} />
          </div>
          <div>
            <label className="win-label">赛制</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setFormat(null)}
                className={`win-chip ${format === null ? "win-chip-accent" : ""}`}
                style={{ cursor: "pointer", fontSize: 12, color: format === null ? "var(--win-accent)" : "var(--win-text-tertiary)" }}
              >
                未知
              </button>
              {(["BO3", "BO5", "R2"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(format === f ? null : f)}
                  className={`win-chip ${format === f ? "win-chip-accent" : ""}`}
                  style={{ cursor: "pointer", fontSize: 12 }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="win-label">分队性质（每队可独立设置）</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {ev.squads.map((s) => (
                <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 12, color: "var(--win-text-tertiary)" }}>
                    第 {s.index} 队 · {s.registeredCount}/{s.capacity} 人
                  </div>
                  <TagEditor
                    type="squadNature"
                    selectedId={squadNatures[s.id]}
                    onSelect={(id) => setSquadNatures((prev) => ({ ...prev, [s.id]: id }))}
                  />
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              className="win-btn win-btn-primary"
              style={{ fontSize: 13 }}
              disabled={!dirty}
              onClick={() => {
                const patch: any = {};
                if (natureId !== ev.nature.id) patch.natureId = natureId;
                if (nameId !== ev.name.id) patch.nameId = nameId;
                if (mapId !== (ev.map?.id ?? "")) patch.mapId = mapId || null;
                if (format !== ev.format) patch.format = format;
                const changedSquads = ev.squads
                  .filter((s) => squadNatures[s.id] !== s.nature.id)
                  .map((s) => ({ id: s.id, natureId: squadNatures[s.id] }));
                if (changedSquads.length > 0) patch.squads = changedSquads;
                onSave(ev, patch);
              }}
            >
              保存修改
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
