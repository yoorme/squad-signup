"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDateTime } from "@/lib/constants";

interface Nature { id: string; name: string; }
interface Name { id: string; name: string; }
interface EventMap { id: string; name: string; }
interface SquadNature { id: string; name: string; }

interface Squad {
  id: string;
  index: number;
  capacity: number;
  nature: SquadNature;
  registeredCount: number;
}
interface EventListItem {
  id: string;
  title: string;
  eventTime: string;
  status: "UPCOMING" | "ARCHIVED";
  requiredCount: number;
  format: "BO3" | "BO5" | "R2" | null;
  nature: Nature;
  name: Name | null;
  customName: string | null;
  map: EventMap | null;
  squads: Squad[];
  totalRegistered: number;
  totalSubstitutes: number;
  myRegistration: { squadId: string | null; isSubstitute: boolean } | null;
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [filter, setFilter] = useState<"UPCOMING" | "ARCHIVED" | "ALL">("UPCOMING");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/events?status=${filter}`);
    const data = await res.json();
    if (data.ok) setEvents(data.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 880, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>赛事</h1>
          <p style={{ fontSize: 13, color: "var(--win-text-secondary)", marginTop: 4 }}>
            查看即将进行的赛事并报名
          </p>
        </div>
        <div style={{ display: "flex", gap: 4, padding: 4, background: "var(--win-bg-hover)", borderRadius: 6 }}>
          {(["UPCOMING", "ARCHIVED", "ALL"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "6px 12px",
                borderRadius: 4,
                border: "none",
                background: filter === f ? "var(--win-bg-card-solid)" : "transparent",
                color: filter === f ? "var(--win-accent)" : "var(--win-text-secondary)",
                fontSize: 13,
                cursor: "pointer",
                fontWeight: filter === f ? 600 : 400,
                boxShadow: filter === f ? "var(--win-shadow-card)" : "none",
              }}
            >
              {f === "UPCOMING" ? "即将进行" : f === "ARCHIVED" ? "已结束" : "全部"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--win-text-tertiary)" }}>加载中...</div>
      ) : events.length === 0 ? (
        <div className="win-card" style={{ padding: 40, textAlign: "center", color: "var(--win-text-tertiary)" }}>
          暂无赛事
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {events.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({ event }: { event: EventListItem }) {
  const natureColors: Record<string, string> = {
    正赛: "var(--win-danger)",
    训练赛: "var(--win-accent)",
    娱乐赛: "var(--win-success)",
    其他: "var(--win-text-tertiary)",
  };

  return (
    <Link
      href={`/events/${event.id}`}
      className="win-card win-reveal"
      style={{
        padding: 20,
        display: "block",
        textDecoration: "none",
        color: "inherit",
        cursor: "pointer",
        opacity: event.status === "ARCHIVED" ? 0.7 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <span
              className="win-chip"
              style={{
                background: "transparent",
                borderColor: natureColors[event.nature.name] || "var(--win-border-strong)",
                color: natureColors[event.nature.name] || "var(--win-text-secondary)",
                fontSize: 11,
              }}
            >
              {event.nature.name}
            </span>
            {(event.name || event.customName) && (
              <span className="win-chip" style={{ fontSize: 11 }}>{event.name?.name ?? event.customName}</span>
            )}
            {event.map && (
              <span className="win-chip" style={{ fontSize: 11 }}>{event.map.name}</span>
            )}
            {event.format && (
              <span className="win-chip" style={{ fontSize: 11, background: "var(--win-bg-selected)", color: "var(--win-accent)", borderColor: "var(--win-accent)" }}>
                {event.format}
              </span>
            )}
            {event.status === "ARCHIVED" && (
              <span className="win-chip" style={{ fontSize: 11, background: "var(--win-bg-pressed)", color: "var(--win-text-tertiary)" }}>
                已结束
              </span>
            )}
            {event.myRegistration && (
              <span className="win-chip" style={{ fontSize: 11, background: "var(--win-bg-selected)", color: "var(--win-accent)", borderColor: "var(--win-accent)" }}>
                {event.myRegistration.isSubstitute ? "替补中" : "已报名"}
              </span>
            )}
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{event.title}</h3>
          <div style={{ fontSize: 13, color: "var(--win-text-secondary)" }}>
            {formatDateTime(event.eventTime)}
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--win-text-tertiary)", flexShrink: 0, marginTop: 4 }}>
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ color: "var(--win-text-tertiary)" }}>报名</span>
          <span style={{ fontWeight: 600, color: event.totalRegistered >= event.requiredCount ? "var(--win-success)" : "var(--win-text)" }}>
            {event.totalRegistered}
          </span>
          <span style={{ color: "var(--win-text-tertiary)" }}>/{event.requiredCount}</span>
        </div>
        {event.totalSubstitutes > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: "var(--win-text-tertiary)" }}>替补</span>
            <span style={{ fontWeight: 600 }}>{event.totalSubstitutes}</span>
          </div>
        )}
        <div style={{ color: "var(--win-text-secondary)" }}>
          分队：
          {event.squads.map((s, i) => (
            <span key={s.id}>
              {i > 0 && <span style={{ color: "var(--win-text-tertiary)" }}>、</span>}
              <span style={{ color: s.registeredCount >= s.capacity ? "var(--win-success)" : "var(--win-text)" }}>
                {s.registeredCount}/{s.capacity}
              </span>
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
