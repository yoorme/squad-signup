"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { Markdown } from "@/components/ui/Markdown";

interface ImageItem { id?: string; path: string; }

export default function AnnouncementEditorPage() {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const toast = useToast();

  const isEdit = !!params.id;
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  const load = async () => {
    if (!isEdit) return;
    const res = await fetch(`/api/announcements?mode=detail&id=${params.id}`);
    const data = await res.json();
    if (data.ok) {
      setTitle(data.data.title);
      setContent(data.data.contentMarkdown);
      setImages(data.data.images.map((img: any) => ({ id: img.id, path: img.path })));
    } else {
      toast(data.error || "加载失败", "error");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleUpload = async (files: FileList) => {
    if (files.length === 0) return;
    if (images.length + files.length > 9) {
      toast("最多 9 张图片", "warning");
      return;
    }
    setUploading(true);
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.ok) {
        setImages((prev) => [...prev, { path: data.data.path }]);
        // 同时插入到 Markdown 内容
        setContent((prev) => `${prev}\n\n![图片](${data.data.path})\n`);
      } else {
        toast(data.error || `${file.name} 上传失败`, "error");
      }
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast("标题不能为空", "warning");
      return;
    }
    if (!content.trim()) {
      toast("内容不能为空", "warning");
      return;
    }
    setSaving(true);
    const imagePaths = images.map((i) => i.path);
    if (isEdit) {
      const res = await fetch("/api/announcements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: params.id, title: title.trim(), contentMarkdown: content, images: imagePaths }),
      });
      const data = await res.json();
      setSaving(false);
      if (data.ok) {
        toast("保存成功", "success");
        router.push("/admin/announcements");
      } else {
        toast(data.error || "保存失败", "error");
      }
    } else {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), contentMarkdown: content, images: imagePaths }),
      });
      const data = await res.json();
      setSaving(false);
      if (data.ok) {
        toast("发布成功", "success");
        router.push("/admin/announcements");
      } else {
        toast(data.error || "发布失败", "error");
      }
    }
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: 40, color: "var(--win-text-tertiary)" }}>加载中...</div>;
  }

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <Link href="/admin/announcements" style={{ fontSize: 13, color: "var(--win-text-secondary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        返回公告管理
      </Link>

      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>{isEdit ? "编辑公告" : "发布公告"}</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* 标题 */}
        <div className="win-card" style={{ padding: 16 }}>
          <label className="win-label">标题</label>
          <input
            className="win-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="公告标题"
            style={{ fontSize: 16, fontWeight: 500 }}
          />
        </div>

        {/* 内容编辑 */}
        <div className="win-card" style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <label className="win-label" style={{ margin: 0 }}>内容（Markdown）</label>
            <div style={{ display: "flex", gap: 4, padding: 4, background: "var(--win-bg-hover)", borderRadius: 4 }}>
              <button
                onClick={() => setPreviewMode(false)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 3,
                  border: "none",
                  background: !previewMode ? "var(--win-bg-card-solid)" : "transparent",
                  color: !previewMode ? "var(--win-accent)" : "var(--win-text-secondary)",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: !previewMode ? 600 : 400,
                }}
              >
                编辑
              </button>
              <button
                onClick={() => setPreviewMode(true)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 3,
                  border: "none",
                  background: previewMode ? "var(--win-bg-card-solid)" : "transparent",
                  color: previewMode ? "var(--win-accent)" : "var(--win-text-secondary)",
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: previewMode ? 600 : 400,
                }}
              >
                预览
              </button>
            </div>
          </div>

          {previewMode ? (
            <div style={{ minHeight: 300, padding: 12, background: "var(--win-bg-hover)", borderRadius: 6 }}>
              <Markdown content={content} />
            </div>
          ) : (
            <textarea
              className="win-input win-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="支持 Markdown 语法..."
              style={{ minHeight: 320, fontFamily: "Consolas, monospace", fontSize: 13, lineHeight: 1.6 }}
            />
          )}
        </div>

        {/* 图片上传 */}
        <div className="win-card" style={{ padding: 16 }}>
          <label className="win-label">图片（最多 9 张，每张不超过 5MB）</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {images.map((img, idx) => (
              <div
                key={idx}
                style={{
                  position: "relative",
                  width: 80,
                  height: 80,
                  borderRadius: 6,
                  overflow: "hidden",
                  border: "1px solid var(--win-border)",
                }}
              >
                <img src={img.path} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button
                  onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 2,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: "none",
                    background: "rgba(0,0,0,0.5)",
                    color: "white",
                    cursor: "pointer",
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            {images.length < 9 && (
              <label
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 6,
                  border: "2px dashed var(--win-border-strong)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "var(--win-text-tertiary)",
                  fontSize: 12,
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => e.target.files && handleUpload(e.target.files)}
                  disabled={uploading}
                />
                {uploading ? "..." : "+ 上传"}
              </label>
            )}
          </div>
        </div>

        {/* 操作按钮 */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Link href="/admin/announcements" className="win-btn">取消</Link>
          <button className="win-btn win-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : isEdit ? "保存修改" : "发布公告"}
          </button>
        </div>
      </div>
    </div>
  );
}
