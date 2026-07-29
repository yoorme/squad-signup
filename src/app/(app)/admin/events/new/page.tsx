"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { calculateSquadCount, toLocalDateTimeInput } from "@/lib/constants";

interface TagItem { id: string; name: string; }
interface Tags {
  natures: TagItem[];
  names: TagItem[];
  squadNatures: TagItem[];
}

export default function NewEventPage() {
  const router = useRouter();
  const toast = useToast();

  const [tags, setTags] = useState<Tags>({ natures: [], names: [], squadNatures: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [eventTime, setEventTime] = useState("");
  const [natureId, setNatureId] = useState("");
  const [nameId, setNameId] = useState("");
  const [requiredCount, setRequiredCount] = useState(16);
  const [squadNatures, setSquadNatures] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/tags");
    const data = await res.json();
    if (data.ok) {
      setTags(data.data);
      if (data.data.natures.length > 0) setNatureId(data.data.natures[0].id);
      if (data.data.names.length > 0) setNameId(data.data.names[0].id);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // 自动计算分队数量
  const teamCount = calculateSquadCount(Number(requiredCount) || 1);

  // 当分队数量变化时，自动调整 squadNatures 数组
  useEffect(() => {
    setSquadNatures((prev) => {
      const next = [...prev];
      while (next.length < teamCount) next.push(tags.squadNatures[0]?.id || "");
      while (next.length > teamCount) next.pop();
      return next;
    });
  }, [teamCount, tags.squadNatures]);

  const handleSave = async () => {
    if (!eventTime) {
      toast("请选择赛事时间", "warning");
      return;
    }
    if (!natureId || !nameId) {
      toast("请选择赛事性质和名称", "warning");
      return;
    }
    if (!Number.isInteger(Number(requiredCount)) || Number(requiredCount) <= 0) {
      toast("要求人数必须是正整数", "warning");
      return;
    }
    if (squadNatures.some((id) => !id)) {
      toast("请为每支分队选择性质", "warning");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventTime,
        natureId,
        nameId,
        requiredCount: Number(requiredCount),
        squadNatures,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.ok) {
      toast("赛事已创建", "success");
      router.push("/events");
      router.refresh();
    } else {
      toast(data.error || "创建失败", "error");
    }
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: 40, color: "var(--win-text-tertiary)" }}>加载中...</div>;
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <Link href="/admin" style={{ fontSize: 13, color: "var(--win-text-secondary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        返回管理首页
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {tags.names.map((n) => (
              <button
                key={n.id}
                onClick={() => setNameId(n.id)}
                className={`win-chip ${nameId === n.id ? "win-chip-accent" : ""}`}
                style={{ cursor: "pointer" }}
              >
                {n.name}
              </button>
            ))}
          </div>
          {tags.names.length === 0 && (
            <span style={{ fontSize: 12, color: "var(--win-text-tertiary)" }}>请先在标签维护中添加赛事名称</span>
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
            onChange={(e) => setRequiredCount(Number(e.target.value))}
            style={{ maxWidth: 200 }}
          />
          <p style={{ fontSize: 12, color: "var(--win-text-tertiary)", marginTop: 6 }}>
            系统自动计算分队数量：{teamCount} 队 × 4 人 = {teamCount * 4} 空位（差值 {teamCount * 4 - Number(requiredCount || 0)} &lt; 4）
          </p>
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
          <p style={{ fontSize: 12, color: "var(--win-text-tertiary)", marginTop: 6 }}>
            分队性质可选：{tags.squadNatures.map((n) => n.name).join("、")}
          </p>
        </div>

        {/* 操作 */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <Link href="/admin" className="win-btn">取消</Link>
          <button className="win-btn win-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "创建中..." : "创建赛事"}
          </button>
        </div>
      </div>
    </div>
  );
}
