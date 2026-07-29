"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useToast } from "@/components/ui/Toast";
import { NAME_PREFIX } from "@/lib/constants";

export default function RegisterPage() {
  const router = useRouter();
  const toast = useToast();

  const [invitationCode, setInvitationCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitationCode.trim() || !nickname.trim() || !password) {
      toast("请填写所有字段", "warning");
      return;
    }
    if (nickname.trim().startsWith(NAME_PREFIX)) {
      toast(`昵称无需填写「${NAME_PREFIX}」前缀`, "warning");
      return;
    }
    if (password.length < 6) {
      toast("密码至少 6 位", "warning");
      return;
    }
    if (password !== confirmPassword) {
      toast("两次密码不一致", "warning");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitationCode: invitationCode.trim(),
          nickname: nickname.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast(data.error || "注册失败", "error");
        setLoading(false);
        return;
      }
      toast("注册成功，正在登录...", "success");
      // 自动登录
      await signIn("credentials", {
        username: data.data.username,
        password,
        redirect: false,
      });
      router.push("/");
      router.refresh();
    } catch (e) {
      toast("网络错误", "error");
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
          maxWidth: 420,
          padding: 32,
          backdropFilter: "blur(40px)",
          background: "rgba(255, 255, 255, 0.95)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
            队员注册
          </h1>
          <p style={{ fontSize: 13, color: "var(--win-text-secondary)" }}>
            需要从管理员处获取邀请码
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="win-label">邀请码</label>
            <input
              className="win-input"
              type="text"
              placeholder="请输入邀请码"
              value={invitationCode}
              onChange={(e) => setInvitationCode(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="win-label">昵称</label>
            <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
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
                {NAME_PREFIX}
              </span>
              <input
                className="win-input"
                type="text"
                placeholder="请输入昵称"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                style={{
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
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
              placeholder="请再次输入密码"
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
            {loading ? "注册中..." : "注册并登录"}
          </button>
        </form>

        <div style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: "var(--win-text-secondary)" }}>
          已有账号？
          <Link
            href="/login"
            style={{ color: "var(--win-accent)", marginLeft: 4, textDecoration: "none" }}
          >
            返回登录
          </Link>
        </div>
      </div>
    </div>
  );
}
