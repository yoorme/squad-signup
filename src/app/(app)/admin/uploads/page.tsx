"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { Loading } from "@/components/ui/StateView";

interface UploadFile {
  name: string;
  path: string;
  size: number;
  referenced: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function AdminUploadsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/uploads");
    const data = await res.json();
    if (data.ok) {
      setFiles(data.data.files);
    } else {
      toast(data.error || "加载失败", "error");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const orphans = files.filter((f) => !f.referenced);
  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const orphanSize = orphans.reduce((s, f) => s + f.size, 0);

  const handleCleanOrphans = async () => {
    const yes = await confirm({
      title: "清理未引用的图片",
      message: `将删除 ${orphans.length} 张未被任何公告引用的图片（约 ${formatSize(orphanSize)}），此操作不可恢复。是否继续？`,
      danger: true,
    });
    if (!yes) return;
    setCleaning(true);
    const res = await fetch("/api/admin/uploads?mode=orphans", { method: "DELETE" });
    const data = await res.json();
    setCleaning(false);
    if (data.ok) {
      toast(`已清理 ${data.data.deletedCount} 张图片`, "success");
      load();
    } else {
      toast(data.error || "清理失败", "error");
    }
  };

  const handleCleanAll = async () => {
    const yes = await confirm({
      title: "删除全部图片（高危）",
      message: `将删除 uploads 目录下全部 ${files.length} 张图片（约 ${formatSize(totalSize)}），包括正在被公告引用的！公告中的图片将变为不可显示。仅在你确认不再需要任何图片时使用。此操作不可恢复。是否继续？`,
      danger: true,
    });
    if (!yes) return;
    setCleaning(true);
    const res = await fetch("/api/admin/uploads?mode=all", { method: "DELETE" });
    const data = await res.json();
    setCleaning(false);
    if (data.ok) {
      toast(`已删除 ${data.data.deletedCount} 张图片`, "success");
      load();
    } else {
      toast(data.error || "删除失败", "error");
    }
  };

  const handleDeleteOne = async (file: UploadFile) => {
    const msg = file.referenced
      ? `该图片正被公告引用！删除后公告中图片将不可显示。确定删除 ${file.name}？`
      : `确定删除未引用图片 ${file.name}？`;
    const yes = await confirm({ title: "删除图片", message: msg, danger: true });
    if (!yes) return;
    const res = await fetch(`/api/upload?path=${encodeURIComponent(file.path)}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      toast("已删除", "success");
      load();
    } else {
      toast(data.error || "删除失败", "error");
    }
  };

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <Link href="/admin" style={{ fontSize: 13, color: "var(--win-text-secondary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        返回管理首页
      </Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>上传文件管理</h1>
          <p style={{ fontSize: 13, color: "var(--win-text-secondary)" }}>
            共 {files.length} 张（{formatSize(totalSize)}），其中 {orphans.length} 张未引用（{formatSize(orphanSize)}）
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="win-btn"
            onClick={handleCleanOrphans}
            disabled={cleaning || orphans.length === 0}
            style={{ fontSize: 12 }}
          >
            {cleaning ? "清理中..." : `清理未引用（${orphans.length}）`}
          </button>
          <button
            className="win-btn"
            onClick={handleCleanAll}
            disabled={cleaning || files.length === 0}
            style={{ fontSize: 12, color: "var(--win-danger)" }}
          >
            删除全部
          </button>
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : files.length === 0 ? (
        <div className="win-card" style={{ padding: 40, textAlign: "center", color: "var(--win-text-tertiary)" }}>
          暂无上传文件
        </div>
      ) : (
        <div className="win-card" style={{ padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12 }}>
            {files.map((file) => (
              <div
                key={file.path}
                style={{
                  position: "relative",
                  borderRadius: 6,
                  overflow: "hidden",
                  border: `1px solid ${file.referenced ? "var(--win-border)" : "var(--win-warning)"}`,
                  aspectRatio: "1",
                }}
              >
                <img
                  src={file.path}
                  alt={file.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                {/* 状态标签 */}
                <div style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: "rgba(0,0,0,0.6)",
                  color: "white",
                  fontSize: 10,
                  padding: "3px 6px",
                  display: "flex",
                  justifyContent: "space-between",
                }}>
                  <span>{formatSize(file.size)}</span>
                  <span>{file.referenced ? "已引用" : "未引用"}</span>
                </div>
                {/* 删除按钮 */}
                <button
                  onClick={() => handleDeleteOne(file)}
                  title="删除"
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    border: "none",
                    background: "rgba(0,0,0,0.6)",
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
          </div>
        </div>
      )}
    </div>
  );
}
