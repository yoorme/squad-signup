"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useToast } from "@/components/ui/Toast";
import { prefixDisplayName } from "@/lib/constants";

interface LoginFormProps {
  teamPrefix: string;
  // 图标版本号（iconUpdatedAt 时间戳）：拼在 /favicon.ico?v= 后，
  // 管理员更换图标后刷新页面即可看到新图标（绕过浏览器缓存）
  iconVersion: number;
}

export function LoginForm({ teamPrefix, iconVersion }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const toast = useToast();

  const displayName = prefixDisplayName(teamPrefix);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast("请填写用户名和密码", "warning");
      return;
    }
    setLoading(true);
    // 输入框按前缀分离展示，提交时拼成完整用户名（auth 侧也兼容带前缀输入）
    const res = await signIn("credentials", {
      username: teamPrefix + username.trim(),
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      toast("用户名或密码错误", "error");
      return;
    }
    toast("登录成功", "success");
    router.push(callbackUrl);
    router.refresh();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background:
          "linear-gradient(135deg, #0078d4 0%, #005a9e 50%, #003d6b 100%)",
      }}
    >
      <div
        className="win-card"
        style={{
          width: "100%",
          maxWidth: 380,
          padding: 32,
          backdropFilter: "blur(40px)",
          background: "rgba(255, 255, 255, 0.95)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          {/* 战队图标：始终显示管理后台配置的图标（自定义优先，无则默认）；
              v= 版本号在更换图标后变化，刷新页面即可绕过浏览器缓存 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/favicon.ico?v=${iconVersion}`}
            alt="战队图标"
            width={56}
            height={56}
            style={{ marginBottom: 12, borderRadius: 12, imageRendering: "pixelated" }}
          />
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
            {displayName}战队报名系统
          </h1>
          <p style={{ fontSize: 13, color: "var(--win-text-secondary)" }}>
            三角洲行动{displayName ? ` ${displayName} ` : ""}战队
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label className="win-label">昵称</label>
            <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
              {teamPrefix && (
                <span
                  className="win-input"
                  style={{
                    flexShrink: 0,
                    width: "auto",
                    borderRight: "none",
                    borderTopRightRadius: 0,
                    borderBottomRightRadius: 0,
                    color: "var(--win-text-tertiary)",
                    background: "var(--win-bg-hover)",
                  }}
                >
                  {teamPrefix}
                </span>
              )}
              <input
                className="win-input"
                type="text"
                placeholder="请输入昵称"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                style={{
                  borderTopLeftRadius: teamPrefix ? 0 : undefined,
                  borderBottomLeftRadius: teamPrefix ? 0 : undefined,
                }}
              />
            </div>
          </div>
          <div>
            <label className="win-label">密码</label>
            <input
              className="win-input"
              type="password"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="win-btn win-btn-primary"
            disabled={loading}
            style={{ marginTop: 8 }}
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>

        <div style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: "var(--win-text-secondary)" }}>
          还没有账号？
          <Link
            href="/register"
            style={{ color: "var(--win-accent)", marginLeft: 4, textDecoration: "none" }}
          >
            凭邀请码注册
          </Link>
        </div>
      </div>
    </div>
  );
}
