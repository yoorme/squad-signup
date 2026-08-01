"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { calculateSquadCount } from "@/lib/constants";
import { Loading } from "@/components/ui/StateView";

interface TagItem { id: string; name: string; }
interface Tags {
  natures: TagItem[];
  names: TagItem[];
  squadNatures: TagItem[];
  maps: TagItem[];
}

export default function NewEventPage() {
  const router = useRouter();
  const toast = useToast();

  const [tags, setTags] = useState<Tags>({ natures: [], names: [], squadNatures: [], maps: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [eventTime, setEventTime] = useState("");
  const [natureId, setNatureId] = useState("");
  // 赛事名称三种模式：tag=关联标签 / other=自定义临时名称 / unknown=不展示名称
  const [nameMode, setNameMode] = useState<"tag" | "other" | "unknown">("unknown");
  const [nameId, setNameId] = useState("");
  const [customName, setCustomName] = useState("");
  const [mapId, setMapId] = useState("");
  const [requiredCount, setRequiredCount] = useState("20");
  const [format, setFormat] = useState<"BO3" | "BO5" | "R2" | null>(null);
  const [squadNatures, setSquadNatures] = useState<string[]>([]);
  const [opponent, setOpponent] = useState("");

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/tags");
    const data = await res.json();
    if (data.ok) {
      setTags(data.data);
      if (data.data.natures.length > 0) setNatureId(data.data.natures[0].id);
      if (data.data.names.length > 0) {
        setNameId(data.data.names[0].id);
        setNameMode("tag");
      }
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // 自动计算分队数量
  const teamCount = calculateSquadCount(Number(requiredCount) || 1);

  // 当分队数量变化或可选标签加载完成时，自动调整 squadNatures 数组
  useEffect(() => {
    const defaultId = tags.squadNatures[0]?.id || "";
    setSquadNatures((prev) => {
      const next = [...prev];
      while (next.length < teamCount) next.push(defaultId);
      while (next.length > teamCount) next.pop();
      // 回填因 tags 未加载而残留的空值
      return next.map((id) => (id || defaultId));
    });
  }, [teamCount, tags.squadNatures]);

  const handleSave = async () => {
    if (!eventTime) {
      toast("请选择赛事时间", "warning");
      return;
    }
    if (!natureId) {
      toast("请选择赛事性质", "warning");
      return;
    }
    // 赛事名称校验：tag 模式需选标签；other 模式需输入至少 1 字符；unknown 无需名称
    if (nameMode === "tag" && !nameId) {
      toast("请选择赛事名称", "warning");
      return;
    }
    if (nameMode === "other" && customName.trim().length === 0) {
      toast("请输入自定义名称（至少 1 个字符）", "warning");
      return;
    }
    const requiredNum = Number(requiredCount);
    if (requiredCount.trim() === "" || !Number.isInteger(requiredNum) || requiredNum <= 0) {
      toast("要求人数必须是非空正整数", "warning");
      return;
    }
    if (squadNatures.some((id) => !id)) {
      toast("请为每支分队选择性质", "warning");
      return;
    }
    if (!opponent.trim()) {
      toast("请输入对手", "warning");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventTime,
        natureId,
        nameId: nameMode === "tag" ? nameId : null,
        customName: nameMode === "other" ? customName.trim() : null,
        mapId: mapId || null,
        requiredCount: requiredNum,
        format,
        squadNatures,
        opponent: opponent.trim(),
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.ok) {
      toast("赛事已创建", "success");
      router.push("/admin/events");
      router.refresh();
    } else {
      toast(data.error || "创建失败", "error");
    }
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <Link href="/admin/events" style={{ fontSize: 13, color: "var(--win-text-secondary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        返回赛事管理
      </Link>

      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>创建赛事</h1>

      <div className="win-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* 时间 */}
        <div>
          <label className="win-label">赛事时间</label>
          <input
            type="datetime-local"
            className="win-input"
            value={eventTime}
            onChange={(e) => setEventTime(e.target.value)}
          />
        </div>

        {/* 赛事性质 */}
        <div>
          <label className="win-label">赛事性质</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {tags.natures.map((n) => (
              <button
                key={n.id}
                onClick={() => setNatureId(n.id)}
                className={`win-chip ${natureId === n.id ? "win-chip-accent" : ""}`}
                style={{ cursor: "pointer" }}
              >
                {n.name}
              </button>
            ))}
          </div>
          {tags.natures.length === 0 && (
            <span style={{ fontSize: 12, color: "var(--win-text-tertiary)" }}>请先在标签维护中添加赛事性质</span>
          )}
        </div>

        {/* 赛事名称 */}
        <div>
          <label className="win-label">赛事名称</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {/* 未知：不展示赛事名称，主体字仅显示赛事性质 */}
            <button
              type="button"
              onClick={() => setNameMode("unknown")}
              className={`win-chip ${nameMode === "unknown" ? "win-chip-accent" : ""}`}
              style={{ cursor: "pointer", color: nameMode === "unknown" ? "var(--win-accent)" : "var(--win-text-tertiary)" }}
            >
              未知
            </button>
            {/* 其他：管理员输入自定义临时名称（最少 1 字符） */}
            <button
              type="button"
              onClick={() => setNameMode("other")}
              className={`win-chip ${nameMode === "other" ? "win-chip-accent" : ""}`}
              style={{ cursor: "pointer", color: nameMode === "other" ? "var(--win-accent)" : "var(--win-text-tertiary)" }}
            >
              其他
            </button>
            {tags.names.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => { setNameId(n.id); setNameMode("tag"); }}
                className={`win-chip ${nameMode === "tag" && nameId === n.id ? "win-chip-accent" : ""}`}
                style={{ cursor: "pointer" }}
              >
                {n.name}
              </button>
            ))}
          </div>
          {/* 其他模式：输入框，最少 1 字符，作为该赛事的临时名称 */}
          {nameMode === "other" && (
            <input
              type="text"
              className="win-input"
              style={{ marginTop: 8, maxWidth: 320 }}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="输入自定义赛事名称（至少 1 个字符）"
              autoFocus
            />
          )}
          {nameMode === "unknown" && (
            <span style={{ fontSize: 12, color: "var(--win-text-tertiary)", marginTop: 6, display: "block" }}>
              不展示赛事名称，主体字仅显示赛事性质
            </span>
          )}
        </div>

        {/* 对手 */}
        <div>
          <label className="win-label">对手</label>
          <input
            type="text"
            className="win-input"
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="请输入对手名称"
            style={{ maxWidth: 320 }}
          />
        </div>

        {/* 赛事地图（可选） */}
        <div>
          <label className="win-label">赛事地图（可选）</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setMapId("")}
              className={`win-chip ${mapId === "" ? "win-chip-accent" : ""}`}
              style={{ cursor: "pointer", color: mapId === "" ? "var(--win-accent)" : "var(--win-text-tertiary)" }}
            >
              未知
            </button>
            {tags.maps.map((m) => (
              <button
                key={m.id}
                onClick={() => setMapId(m.id)}
                className={`win-chip ${mapId === m.id ? "win-chip-accent" : ""}`}
                style={{ cursor: "pointer" }}
              >
                {m.name}
              </button>
            ))}
          </div>
          {tags.maps.length === 0 && (
            <span style={{ fontSize: 12, color: "var(--win-text-tertiary)" }}>请先在标签维护中添加赛事地图</span>
          )}
        </div>

        {/* 要求人数 */}
        <div>
          <label className="win-label">要求人数</label>
          <input
            type="number"
            min={1}
            className="win-input"
            value={requiredCount}
            onChange={(e) => setRequiredCount(e.target.value)}
            style={{ maxWidth: 200 }}
          />
        </div>

        {/* 赛制 */}
        <div>
          <label className="win-label">赛制（可选）</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setFormat(null)}
              className={`win-chip ${format === null ? "win-chip-accent" : ""}`}
              style={{ cursor: "pointer", color: format === null ? "var(--win-accent)" : "var(--win-text-tertiary)" }}
            >
              未知
            </button>
            {(["BO3", "BO5", "R2"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(format === f ? null : f)}
                className={`win-chip ${format === f ? "win-chip-accent" : ""}`}
                style={{ cursor: "pointer" }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* 分队性质设置 */}
        <div>
          <label className="win-label">分队性质设置（{teamCount} 支队伍，每队 4 人空位）</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: teamCount }).map((_, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 60, fontSize: 12, color: "var(--win-text-secondary)" }}>第 {idx + 1} 队</span>
                <select
                  className="win-input"
                  style={{ maxWidth: 200 }}
                  value={squadNatures[idx] || ""}
                  onChange={(e) => {
                    setSquadNatures((prev) => {
                      const next = [...prev];
                      next[idx] = e.target.value;
                      return next;
                    });
                  }}
                >
                  {tags.squadNatures.map((n) => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* 操作 */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <Link href="/admin/events" className="win-btn">取消</Link>
          <button className="win-btn win-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "创建中..." : "创建赛事"}
          </button>
        </div>
      </div>
    </div>
  );
}
