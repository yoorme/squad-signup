"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDateTime } from "@/lib/constants";

interface Ability { id: string; name: string; category: "INFANTRY" | "VEHICLE"; }
interface Duty { id: string; name: string; }
interface Operator { id: string; name: string; faction?: string | null; }

interface Member {
  id: string;
  username: string;
  nickname: string;
  role: "ADMIN" | "MEMBER";
  createdAt: string;
  abilities: Ability[];
  duties: Duty[];
  operators: Operator[];
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/members");
    const data = await res.json();
    if (data.ok) setMembers(data.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = keyword.trim()
    ? members.filter((m) => m.nickname.toLowerCase().includes(keyword.trim().toLowerCase()))
    : members;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 880, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>队员</h1>
          <p style={{ fontSize: 13, color: "var(--win-text-secondary)", marginTop: 4 }}>
            共 {members.length} 位队员
          </p>
        </div>
        <input
          className="win-input"
          type="text"
          placeholder="搜索昵称"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ width: 220, maxWidth: "100%" }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--win-text-tertiary)" }}>加载中...</div>
      ) : filtered.length === 0 ? (
        <div className="win-card" style={{ padding: 40, textAlign: "center", color: "var(--win-text-tertiary)" }}>
          {keyword.trim() ? "未找到匹配的队员" : "暂无队员"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((m) => {
            const infantry = m.abilities.filter((a) => a.category === "INFANTRY");
            const vehicle = m.abilities.filter((a) => a.category === "VEHICLE");
            return (
              <Link
                key={m.id}
                href={`/members/${m.id}`}
                className="win-card win-reveal"
                style={{
                  padding: 20,
                  display: "block",
                  textDecoration: "none",
                  color: "inherit",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 16, fontWeight: 600 }}>{m.username}</span>
                      <span
                        className="win-chip"
                        style={m.role === "ADMIN" ? { background: "var(--win-bg-selected)", color: "var(--win-accent)", borderColor: "var(--win-accent)", fontSize: 11, padding: "2px 8px" } : { fontSize: 11, padding: "2px 8px" }}
                      >
                        {m.role === "ADMIN" ? "管理员" : "队员"}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--win-text-tertiary)" }}>
                      加入于 {formatDateTime(m.createdAt)}
                    </div>
                  </div>
                </div>

                {(infantry.length > 0 || vehicle.length > 0 || m.duties.length > 0 || m.operators.length > 0) && (
                  <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                    {infantry.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, color: "var(--win-text-tertiary)", flexShrink: 0 }}>步兵</span>
                        {infantry.map((a) => (
                          <span key={a.id} className="win-chip win-chip-accent" style={{ fontSize: 12 }}>{a.name}</span>
                        ))}
                      </div>
                    )}
                    {vehicle.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, color: "var(--win-text-tertiary)", flexShrink: 0 }}>载具</span>
                        {vehicle.map((a) => (
                          <span key={a.id} className="win-chip win-chip-accent" style={{ fontSize: 12 }}>{a.name}</span>
                        ))}
                      </div>
                    )}
                    {m.duties.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, color: "var(--win-text-tertiary)", flexShrink: 0 }}>职责</span>
                        {m.duties.map((d) => (
                          <span key={d.id} className="win-chip win-chip-accent" style={{ fontSize: 12 }}>{d.name}</span>
                        ))}
                      </div>
                    )}
                    {m.operators.length > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, color: "var(--win-text-tertiary)", flexShrink: 0 }}>干员</span>
                        {m.operators.map((o) => (
                          <span key={o.id} className="win-chip win-chip-accent" style={{ fontSize: 12 }}>{o.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
