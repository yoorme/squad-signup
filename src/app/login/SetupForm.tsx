"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useToast } from "@/components/ui/Toast";
import { prefixDisplayName } from "@/lib/constants";

interface SetupFormProps {
  teamPrefix: string;
}

// 系统初始化表单：系统中还没有任何用户时显示（首次部署后的第一次访问）
// 创建初始管理员并自动登录；之后本表单不再出现
export function SetupForm({ teamPrefix }: SetupFormProps) {
  const router = useRouter();
  const toast = useToast();

  const displayName = prefixDisplayName(teamPrefix);

  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nickname.trim();
    if (!trimmed || !password) {
      toast("请填写完整信息", "warning");
      return;
    }
    if (password.length < 6) {
      toast("密码至少 6 位", "warning");
      return;
    }
    if (password !== confirmPassword) {
      toast("两次输入的密码不一致", "warning");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: trimmed, password }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast(data.error || "初始化失败", "error");
        return;
      }

      // 创建成功 → 直接用初始管理员登录
      const loginRes = await signIn("credentials", {
        username: data.data.username,
        password,
        redirect: false,
      });
      if (loginRes?.error) {
        toast("管理员已创建，请手动登录", "warning");
        router.push("/login");
        router.refresh();
        return;
      }
      toast("初始化完成，欢迎使用", "success");
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
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
          {displayName ? (
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: "linear-gradient(135deg, #0078d4, #005a9e)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontWeight: 700,
                fontSize: displayName.length > 4 ? 14 : 20,
                marginBottom: 12,
              }}
            >
              {displayName}
            </div>
          ) : (
            // 无前缀时用战队图标作 logo（与管理后台配置的网页图标一致）
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/favicon.ico"
              alt="战队图标"
              width={56}
              height={56}
              style={{ marginBottom: 12, borderRadius: 12, imageRendering: "pixelated" }}
            />
          )}
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
            系统初始化
          </h1>
          <p style={{ fontSize: 13, color: "var(--win-text-secondary)" }}>
            首次使用，请创建初始管理员账户
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label className="win-label">管理员昵称</label>
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
                placeholder="登录用的昵称"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                autoFocus
                maxLength={16}
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
              placeholder="至少 6 位"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="win-label">确认密码</label>
            <input
              className="win-input"
              type="password"
              placeholder="再输入一次密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="win-btn win-btn-primary"
            disabled={loading}
            style={{ marginTop: 8 }}
          >
            {loading ? "初始化中..." : "创建管理员并进入系统"}
          </button>
        </form>

        <p style={{ marginTop: 16, textAlign: "center", fontSize: 12, color: "var(--win-text-tertiary)" }}>
          初始管理员拥有全部权限，创建后其他成员凭邀请码注册
        </p>
      </div>
    </div>
  );
}
