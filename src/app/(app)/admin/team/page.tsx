"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { Loading } from "@/components/ui/StateView";
import { prefixDisplayName } from "@/lib/constants";

interface TeamSettings {
  teamPrefix: string;
  hasCustomIcon: boolean;
  iconVersion: number;
}

export default function AdminTeamPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [settings, setSettings] = useState<TeamSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [prefix, setPrefix] = useState("");
  const [savingPrefix, setSavingPrefix] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/team");
    const data = await res.json();
    if (data.ok) {
      setSettings(data.data);
      setPrefix(data.data.teamPrefix);
    } else {
      toast(data.error || "加载失败", "error");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSavePrefix = async () => {
    const trimmed = prefix.trim();
    if (trimmed.length > 12) {
      toast("前缀长度不能超过 12 个字符", "warning");
      return;
    }
    if (/\s/.test(trimmed)) {
      toast("前缀不能包含空白字符", "warning");
      return;
    }
    const changed = trimmed !== settings?.teamPrefix;
    const displayName = prefixDisplayName(trimmed) || "无";
    const yes = await confirm({
      title: "修改战队名称前缀",
      message: changed
        ? `确定将前缀修改为「${trimmed || "（无前缀）"}」吗？\n\n所有存量用户的登录用户名将自动迁移为「${trimmed || "无前缀"}＋昵称」，队员需按新前缀登录。站点标题将显示为「${displayName}战队报名系统」。`
        : `前缀未变化，仅保存当前设置。`,
      danger: changed,
    });
    if (!yes) return;

    setSavingPrefix(true);
    const res = await fetch("/api/admin/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamPrefix: trimmed }),
    });
    const data = await res.json();
    setSavingPrefix(false);
    if (data.ok) {
      toast(
        changed ? `已保存，迁移了 ${data.data.migrated} 个用户名` : "已保存",
        "success"
      );
      load();
    } else {
      toast(data.error || "保存失败", "error");
    }
  };

  const handleUploadIcon = async (file: File) => {
    // 客户端预校验（服务端仍会做魔数与尺寸校验）
    if (!file.name.toLowerCase().endsWith(".ico")) {
      toast("仅支持 .ico 文件", "warning");
      return;
    }
    if (file.size > 512 * 1024) {
      toast("图标文件不能超过 512KB", "warning");
      return;
    }
    const yes = await confirm({
      title: "上传战队图标",
      message: `确定将「${file.name}」设为战队图标吗？\n\n要求 32×32 的 .ico 文件，将应用于浏览器标签页图标。`,
    });
    if (!yes) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/admin/team", { method: "POST", body: formData });
    const data = await res.json();
    setUploading(false);
    if (data.ok) {
      toast("图标已更新", "success");
      load();
    } else {
      toast(data.error || "上传失败", "error");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleResetIcon = async () => {
    const yes = await confirm({
      title: "恢复默认图标",
      message: "确定恢复为系统默认图标吗？当前自定义图标将被删除。",
      danger: true,
    });
    if (!yes) return;
    const res = await fetch("/api/admin/team", { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      toast("已恢复默认图标", "success");
      load();
    } else {
      toast(data.error || "操作失败", "error");
    }
  };

  if (loading || !settings) {
    return <Loading />;
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 4 }}>战队管理</h1>
      <p style={{ fontSize: 13, color: "var(--win-text-secondary)", marginBottom: 24 }}>
        战队名称前缀与战队图标为全局配置，影响登录用户名、站点标题与网页图标
      </p>

      {/* 前缀设置 */}
      <div className="win-card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>战队名称前缀</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <input
            className="win-input"
            type="text"
            placeholder="留空 = 无前缀"
            value={prefix}
            maxLength={12}
            onChange={(e) => setPrefix(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            className="win-btn win-btn-primary"
            onClick={handleSavePrefix}
            disabled={savingPrefix}
          >
            {savingPrefix ? "保存中..." : "保存"}
          </button>
        </div>
        <p style={{ fontSize: 12, color: "var(--win-text-tertiary)", marginTop: 10, lineHeight: 1.7 }}>
          · 用户名 = 前缀 + 昵称（如「{prefix || "无前缀"}＋昵称」），登录与注册均按此前缀拼接<br />
          · 修改后所有存量用户的用户名将自动迁移为新前缀 + 昵称，队员需按新前缀登录<br />
          · 站点标题显示为「{prefixDisplayName(prefix) || "战队"}报名系统」样式的展示名（自动去掉尾部 丨 - 等分隔符）
        </p>
      </div>

      {/* 图标设置 */}
      <div className="win-card" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>战队图标</h2>
        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          {/* 预览：image-rendering: pixelated 放大 32×32 便于查看 */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 8,
              border: "1px solid var(--win-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--win-bg-hover)",
              flexShrink: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/favicon.ico?v=${settings.iconVersion}`}
              alt="战队图标"
              width={48}
              height={48}
              style={{ imageRendering: "pixelated" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 220 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="win-btn win-btn-primary"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? "上传中..." : "上传图标"}
              </button>
              {settings.hasCustomIcon && (
                <button className="win-btn" onClick={handleResetIcon} disabled={uploading}>
                  恢复默认
                </button>
              )}
            </div>
            <p style={{ fontSize: 12, color: "var(--win-text-tertiary)", lineHeight: 1.7 }}>
              仅支持 32×32 的 .ico 文件（多尺寸 ICO 会被拒绝），应用于浏览器标签页图标
              {settings.hasCustomIcon ? "。当前使用自定义图标。" : "。当前使用默认图标。"}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".ico"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUploadIcon(file);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
