"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { formatDateTime } from "@/lib/constants";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SquadManageView } from "@/components/events/SquadManageView";

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

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const myUserId = (session?.user as any)?.id;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  // 记录上一次已知版本号，用于检测后台轮询拉到的新数据是否真的有变化
  const lastVersionRef = useRef<string | undefined>(undefined);
  // 标记下一次 load 是用户自己的操作触发的，不应弹“数据已同步”提示
  const skipSyncToastRef = useRef(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    // 仅拉取当前赛事详情，避免拉全量列表
    const res = await fetch(`/api/events?id=${encodeURIComponent(params.id)}`);
    const data = await res.json();
    if (data.ok) {
      const found: EventDetail | null = data.data;
      if (found) {
        // 若静默刷新发现版本号变化，提示用户数据已更新
        // 但如果是用户自己刚操作触发的刷新，则跳过提示
        // 注意：用 !== undefined 判断"非首次加载"，避免空字符串 version 被当作 falsy 漏掉提示
        if (
          silent &&
          !skipSyncToastRef.current &&
          lastVersionRef.current !== undefined &&
          lastVersionRef.current !== found.version
        ) {
          toast("数据已同步至最新", "info");
        }
        skipSyncToastRef.current = false;
        lastVersionRef.current = found.version;
        setEvent(found);
      } else {
        setEvent(null);
      }
    } else if (res.status === 404) {
      setEvent(null);
    }
    if (!silent) setLoading(false);
  };

  // 用户主动操作后的刷新：不弹同步提示
  const reloadAfterMutation = () => {
    skipSyncToastRef.current = true;
    return load(false);
  };

  // 初次加载
  useEffect(() => { if (params.id) load(); }, [params.id]);

  // 后台静默轮询：每 15 秒拉一次最新状态，避免用户长期看过期数据
  useEffect(() => {
    if (!event || event.status === "ARCHIVED") return;
    const timer = setInterval(() => load(true), 15000);
    // 页面重新可见时立即刷新一次
    const onVisible = () => {
      if (document.visibilityState === "visible") load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [event?.id, event?.status]);

  if (loading) {
    return <div style={{ textAlign: "center", padding: 40, color: "var(--win-text-tertiary)" }}>加载中...</div>;
  }
  if (!event) {
    return <div className="win-card" style={{ padding: 40, textAlign: "center" }}>赛事不存在</div>;
  }

  const isArchived = event.status === "ARCHIVED";
  const myReg = event.myRegistration;

  // 队员报名
  const handleRegister = async (squadId: string | null, asSubstitute: boolean) => {
    const res = await fetch("/api/events/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: event.id, squadId, asSubstitute }),
    });
    const data = await res.json();
    if (data.ok) {
      // 若服务端因分队满员回退为替补
      if (data.data?.fellbackToSubstitute) {
        toast(data.data.message || "该分队已满，已自动加入替补", "warning");
      } else {
        toast(asSubstitute ? "已加入替补" : "报名成功", "success");
      }
      reloadAfterMutation();
    } else {
      toast(data.error || "报名失败", "error");
    }
  };

  const handleCancel = async () => {
    if (!myReg) return;
    const yes = await confirm({
      title: "取消报名",
      message: "确定要取消报名吗？取消后可重新报名。",
      confirmText: "取消报名",
      danger: true,
    });
    if (!yes) return;
    // 找到我的 registrationId
    const regId = findMyRegistrationId(event, myUserId);
    if (!regId) return toast("未找到报名记录", "error");
    const res = await fetch(`/api/events/register?registrationId=${regId}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      toast("已取消报名", "success");
      reloadAfterMutation();
    } else {
      // 409 表示报名记录已被其他操作改变（如管理员已移动）
      if (res.status === 409) {
        toast(data.error || "报名状态已变化", "warning");
        reloadAfterMutation();
      } else {
        toast(data.error || "取消失败", "error");
      }
    }
  };

  const handleDelete = async () => {
    const yes = await confirm({
      title: "删除赛事",
      message: "确定要删除此赛事吗？所有报名记录将一并删除，无法恢复。",
      confirmText: "删除",
      danger: true,
    });
    if (!yes) return;
    const res = await fetch(`/api/events/manage?id=${event.id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      toast("已删除", "success");
      router.push("/events");
      router.refresh();
    } else {
      toast(data.error || "删除失败", "error");
    }
  };

  const handleArchiveToggle = async () => {
    const next = isArchived ? "UPCOMING" : "ARCHIVED";
    const res = await fetch("/api/events/manage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: event.id, status: next }),
    });
    const data = await res.json();
    if (data.ok) {
      toast(isArchived ? "已恢复" : "已归档", "success");
      reloadAfterMutation();
    } else {
      toast(data.error || "操作失败", "error");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1080, margin: "0 auto" }}>
      <Link
        href="/events"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 13,
          color: "var(--win-text-secondary)",
          textDecoration: "none",
          alignSelf: "flex-start",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        返回赛事列表
      </Link>

      {/* 赛事头部 */}
      <div className="win-card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <span className="win-chip" style={{ fontSize: 11, borderColor: "var(--win-border-strong)" }}>{event.nature.name}</span>
              <span className="win-chip" style={{ fontSize: 11 }}>{event.name.name}</span>
              {event.format && (
                <span className="win-chip" style={{ fontSize: 11, background: "var(--win-bg-selected)", color: "var(--win-accent)", borderColor: "var(--win-accent)" }}>
                  {event.format}
                </span>
              )}
              {isArchived && (
                <span className="win-chip" style={{ fontSize: 11, background: "var(--win-bg-pressed)", color: "var(--win-text-tertiary)" }}>已结束</span>
              )}
              {myReg && (
                <span className="win-chip" style={{ fontSize: 11, background: "var(--win-bg-selected)", color: "var(--win-accent)", borderColor: "var(--win-accent)" }}>
                  {myReg.isSubstitute ? "我·替补" : "我·已报名"}
                </span>
              )}
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>{event.title}</h1>
            <div style={{ fontSize: 13, color: "var(--win-text-secondary)" }}>{formatDateTime(event.eventTime)}</div>
          </div>
          {isAdmin && (
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button onClick={handleArchiveToggle} className="win-btn win-btn-secondary" style={{ fontSize: 12, padding: "4px 10px", minHeight: 28 }}>
                {isArchived ? "恢复" : "归档"}
              </button>
              <button onClick={handleDelete} className="win-btn win-btn-danger" style={{ fontSize: 12, padding: "4px 10px", minHeight: 28 }}>
                删除
              </button>
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--win-border)", display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
          <div>
            <span style={{ color: "var(--win-text-tertiary)" }}>报名人数：</span>
            <span style={{ fontWeight: 600 }}>{event.totalRegistered}/{event.requiredCount}</span>
          </div>
          <div>
            <span style={{ color: "var(--win-text-tertiary)" }}>替补：</span>
            <span style={{ fontWeight: 600 }}>{event.totalSubstitutes}</span>
          </div>
          <div>
            <span style={{ color: "var(--win-text-tertiary)" }}>分队数：</span>
            <span style={{ fontWeight: 600 }}>{event.squads.length}</span>
          </div>
        </div>
      </div>

      {/* 分队与替补展示/管理 */}
      {isAdmin ? (
        <SquadManageView event={event} onChanged={reloadAfterMutation} disabled={isArchived} />
      ) : (
        <SquadDisplayView
          event={event}
          myReg={myReg}
          myUserId={myUserId}
          onRegister={handleRegister}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}

function findMyRegistrationId(event: EventDetail, userId?: string): string | null {
  if (!userId) return null;
  for (const s of event.squads) {
    const m = s.members.find((m) => m.userId === userId);
    if (m) return m.registrationId;
  }
  const sub = event.substitutes.find((m) => m.userId === userId);
  return sub?.registrationId || null;
}

// 队员视图：只读分队 + 报名按钮
function SquadDisplayView({
  event,
  myReg,
  myUserId,
  onRegister,
  onCancel,
}: {
  event: EventDetail;
  myReg: { squadId: string | null; isSubstitute: boolean } | null;
  myUserId?: string;
  onRegister: (squadId: string | null, asSubstitute: boolean) => void;
  onCancel: () => void;
}) {
  const isArchived = event.status === "ARCHIVED";
  const mySquadId = myReg?.squadId || null;

  return (
    <div className="win-card" style={{ padding: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>分队与报名</h2>

      {/* 分队列表 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {/* 表头 */}
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", padding: "8px 12px", borderBottom: "2px solid var(--win-border)", fontSize: 12, color: "var(--win-text-secondary)", fontWeight: 600 }}>
          <div>分队性质</div>
          <div>成员</div>
        </div>

        {event.squads.map((s) => {
          const isMySquad = mySquadId === s.id;
          const isFull = s.registeredCount >= s.capacity;
          const canJoin = !isArchived && !myReg && !isFull;
          return (
            <div
              key={s.id}
              style={{
                display: "grid",
                gridTemplateColumns: "120px 1fr",
                padding: "12px",
                borderBottom: "1px solid var(--win-border)",
                alignItems: "center",
                background: isMySquad ? "var(--win-bg-selected)" : "transparent",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="win-chip" style={{ alignSelf: "flex-start", fontSize: 12 }}>{s.nature.name}</span>
                <span style={{ fontSize: 11, color: "var(--win-text-tertiary)" }}>第 {s.index} 队 · {s.registeredCount}/{s.capacity}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                {s.members.length === 0 ? (
                  <span style={{ fontSize: 13, color: "var(--win-text-tertiary)" }}>暂无</span>
                ) : (
                  s.members.map((m) => (
                    <MemberChip key={m.userId} member={m} isMe={m.userId === myUserId} />
                  ))
                )}
                {canJoin && (
                  <button
                    onClick={() => onRegister(s.id, false)}
                    className="win-btn win-btn-primary"
                    style={{ fontSize: 12, padding: "4px 10px", minHeight: 26, marginLeft: 4 }}
                  >
                    + 报名
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* 替补区 */}
        <div style={{ height: 32 }} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "120px 1fr",
            padding: "12px",
            borderTop: "2px solid var(--win-border)",
            alignItems: "center",
            background: myReg?.isSubstitute ? "var(--win-bg-selected)" : "transparent",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="win-chip" style={{ alignSelf: "flex-start", fontSize: 12, background: "var(--win-bg-pressed)", borderColor: "var(--win-border-strong)" }}>替补</span>
            <span style={{ fontSize: 11, color: "var(--win-text-tertiary)" }}>{event.totalSubstitutes} 人</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {event.substitutes.length === 0 ? (
              <span style={{ fontSize: 13, color: "var(--win-text-tertiary)" }}>暂无</span>
            ) : (
              event.substitutes.map((m) => (
                <MemberChip key={m.userId} member={m} isMe={m.userId === myUserId} />
              ))
            )}
            {!isArchived && !myReg && (
              <button
                onClick={() => onRegister(null, true)}
                className="win-btn win-btn-secondary"
                style={{ fontSize: 12, padding: "4px 10px", minHeight: 26, marginLeft: 4 }}
              >
                + 加入替补
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 我的报名操作 */}
      {myReg && !isArchived && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--win-border)", display: "flex", justifyContent: "center" }}>
          <button onClick={onCancel} className="win-btn win-btn-danger">
            取消报名
          </button>
        </div>
      )}
    </div>
  );
}

// 成员 chip
function MemberChip({ member, isMe }: { member: Member; isMe?: boolean }) {
  const duty = member.duties.find((d) => d.name !== "无");
  const abilityLabels = member.abilities.map((a) => a.name).slice(0, 3);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 10px",
        borderRadius: 16,
        background: isMe ? "var(--win-bg-selected)" : "var(--win-bg-hover)",
        border: `1px solid ${isMe ? "var(--win-accent)" : "var(--win-border)"}`,
        fontSize: 12,
        color: isMe ? "var(--win-accent)" : "var(--win-text)",
      }}
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
