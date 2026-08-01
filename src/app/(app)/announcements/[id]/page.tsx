"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Markdown } from "@/components/ui/Markdown";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { formatDateTime } from "@/lib/constants";
import { Loading } from "@/components/ui/StateView";

interface AnnouncementDetail {
  id: string;
  title: string;
  contentMarkdown: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; username: string; nickname: string };
  images: { id: string; path: string }[];
  reads: { confirmedAt: string | null }[];
  comments: {
    id: string;
    content: string;
    createdAt: string;
    user: { id: string; username: string; nickname: string };
    isMine?: boolean;
  }[];
}

export default function AnnouncementDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const toast = useToast();
  const confirm = useConfirm();

  const [detail, setDetail] = useState<AnnouncementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const isAdmin = session?.user?.role === "ADMIN";

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/announcements?mode=detail&id=${params.id}`);
    const data = await res.json();
    if (data.ok) setDetail(data.data);
    else toast(data.error || "加载失败", "error");
    setLoading(false);
  };

  useEffect(() => {
    if (params.id) load();
  }, [params.id]);

  const handleConfirm = async () => {
    const res = await fetch("/api/announcements/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ announcementId: params.id }),
    });
    const data = await res.json();
    if (data.ok) {
      toast("已确认", "success");
      load();
    } else {
      toast(data.error || "确认失败", "error");
    }
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim()) {
      toast("请输入留言内容", "warning");
      return;
    }
    setSubmittingComment(true);
    const res = await fetch("/api/announcements/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ announcementId: params.id, content: commentText.trim() }),
    });
    const data = await res.json();
    setSubmittingComment(false);
    if (data.ok) {
      setCommentText("");
      toast("留言已发布", "success");
      load();
    } else {
      toast(data.error || "发布失败", "error");
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const yes = await confirm({
      title: "删除留言",
      message: "确定要删除这条留言吗？",
      confirmText: "删除",
      danger: true,
    });
    if (!yes) return;
    const res = await fetch(`/api/announcements/comments?id=${commentId}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      toast("已删除", "success");
      load();
    } else {
      toast(data.error || "删除失败", "error");
    }
  };

  const handleDeleteAnnouncement = async () => {
    const yes = await confirm({
      title: "删除公告",
      message: "确定要删除此公告吗？删除后无法恢复，关联的留言也会一并删除。",
      confirmText: "删除",
      danger: true,
    });
    if (!yes) return;
    const res = await fetch(`/api/announcements?id=${params.id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      toast("已删除", "success");
      router.push("/announcements");
      router.refresh();
    } else {
      toast(data.error || "删除失败", "error");
    }
  };

  if (loading) {
    return <Loading />;
  }
  if (!detail) {
    return <div className="win-card" style={{ padding: 40, textAlign: "center" }}>公告不存在</div>;
  }

  const isConfirmed = detail.reads.some((r) => r.confirmedAt);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 880, margin: "0 auto" }}>
      <Link
        href="/announcements"
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
        返回公告列表
      </Link>

      {/* 公告主体 */}
      <article className="win-card" style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>{detail.title}</h1>
            <div style={{ fontSize: 12, color: "var(--win-text-tertiary)", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <Link href={`/members/${detail.author.id}`} style={{ color: "var(--win-text-secondary)", textDecoration: "none" }}>{detail.author.username}</Link>
              <span>发布于 {formatDateTime(detail.createdAt)}</span>
              {detail.updatedAt !== detail.createdAt && <span>更新于 {formatDateTime(detail.updatedAt)}</span>}
            </div>
          </div>
          {isAdmin && (
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <Link href={`/admin/announcements/${detail.id}/edit`} className="win-btn win-btn-secondary" style={{ fontSize: 12, padding: "4px 10px", minHeight: 28 }}>
                编辑
              </Link>
              <button onClick={handleDeleteAnnouncement} className="win-btn win-btn-danger" style={{ fontSize: 12, padding: "4px 10px", minHeight: 28 }}>
                删除
              </button>
            </div>
          )}
        </div>

        <Markdown content={detail.contentMarkdown} />

        {detail.images.length > 0 && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {detail.images.map((img) => (
              <img
                key={img.id}
                src={img.path}
                alt="公告图片"
                style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid var(--win-border)" }}
              />
            ))}
          </div>
        )}

        {/* 确认按钮 */}
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--win-border)", display: "flex", justifyContent: "center" }}>
          {isConfirmed ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--win-success)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ fontSize: 14, fontWeight: 500 }}>已确认</span>
            </div>
          ) : (
            <button className="win-btn win-btn-primary" onClick={handleConfirm}>
              确认已阅
            </button>
          )}
        </div>
      </article>

      {/* 评论区 */}
      <section className="win-card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
          留言（{detail.comments.length}）
        </h2>

        {/* 发表留言 */}
        <div style={{ marginBottom: 20 }}>
          <textarea
            className="win-input win-textarea"
            placeholder="发表留言..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            maxLength={500}
            style={{ minHeight: 80 }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <span style={{ fontSize: 12, color: "var(--win-text-tertiary)" }}>{commentText.length}/500</span>
            <button
              className="win-btn win-btn-primary"
              onClick={handleSubmitComment}
              disabled={submittingComment || !commentText.trim()}
            >
              {submittingComment ? "发布中..." : "发布"}
            </button>
          </div>
        </div>

        {/* 留言列表 */}
        {detail.comments.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, color: "var(--win-text-tertiary)", fontSize: 13 }}>
            暂无留言，来说点什么吧
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {detail.comments.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: 12,
                  background: "var(--win-bg-hover)",
                  borderRadius: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <Link href={`/members/${c.user.id}`} style={{ fontSize: 13, fontWeight: 600, color: "var(--win-text)", textDecoration: "none" }}>{c.user.username}</Link>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "var(--win-text-tertiary)" }}>{formatDateTime(c.createdAt)}</span>
                    {(c.isMine || isAdmin) && (
                      <button
                        onClick={() => handleDeleteComment(c.id)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--win-danger)",
                          fontSize: 11,
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 14, color: "var(--win-text)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {c.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
