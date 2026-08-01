"use client";

import { useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import useSWR from "swr";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { Loading, ErrorState } from "@/components/ui/StateView";
import { formatDateTime } from "@/lib/constants";
import { fetcher } from "@/lib/fetcher";
import type { EventDetail, EventMember, MyRegistration } from "@/types";

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: session } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const myUserId = session?.user?.id;

  // SWR 数据层：15 秒自动轮询（归档后停止）、页面重新聚焦时刷新、请求去重
  const {
    data: event,
    error,
    isLoading,
    mutate,
  } = useSWR<EventDetail>(
    params.id ? `/api/events?id=${encodeURIComponent(params.id)}` : null,
    fetcher,
    {
      refreshInterval: (latest) => (latest?.status === "ARCHIVED" ? 0 : 15000),
      revalidateOnFocus: true,
    }
  );

  // 记录上一次已知版本号，用于检测后台轮询拉到的新数据是否真的有变化
  const lastVersionRef = useRef<string | undefined>(undefined);
  // 标记下一次刷新是用户自己的操作触发的，不应弹"数据已同步"提示
  const skipSyncToastRef = useRef(false);

  useEffect(() => {
    if (!event) return;
    if (
      lastVersionRef.current !== undefined &&
      lastVersionRef.current !== event.version &&
      !skipSyncToastRef.current
    ) {
      toast("数据已同步至最新", "info");
    }
    skipSyncToastRef.current = false;
    lastVersionRef.current = event.version;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.version]);

  // 用户主动操作后的刷新：不弹同步提示
  const reloadAfterMutation = () => {
    skipSyncToastRef.current = true;
    return mutate();
  };

  if (isLoading) {
    return <Loading />;
  }
  if (error) {
    const status = (error as { status?: number }).status;
    if (status === 404) {
      return <div className="win-card" style={{ padding: 40, textAlign: "center" }}>赛事不存在</div>;
    }
    return <ErrorState message={error.message || "加载失败"} onRetry={() => mutate()} />;
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

      {/* 分队与替补展示（管理员与普通队员一致；赛事标签/分队性质编辑请在「赛事管理」中操作）*/}
      <SquadDisplayView
        event={event}
        myReg={myReg}
        myUserId={myUserId}
        onRegister={handleRegister}
        onCancel={handleCancel}
      />
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
  myReg: MyRegistration | null;
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

// 成员 chip - 点击跳转到队员详情页
function MemberChip({ member, isMe }: { member: EventMember; isMe?: boolean }) {
  const duty = member.duties.find((d) => d.name !== "无");
  const abilityLabels = member.abilities.map((a) => a.name).slice(0, 3);
  return (
    <Link
      href={`/members/${member.userId}`}
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
        textDecoration: "none",
        cursor: "pointer",
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
    </Link>
  );
}
