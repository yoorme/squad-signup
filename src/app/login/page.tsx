"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useToast } from "@/components/ui/Toast";
import { NAME_PREFIX } from "@/lib/constants";

// useSearchParams 在静态预渲染时需要 Suspense 边界包裹，否则触发 CSR bailout
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const toast = useToast();

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
    // 前端已分离 MMR丨前缀，提交时拼成完整用户名（auth 兼容无前缀输入，此处拼接保证一致）
    const res = await signIn("credentials", {
      username: NAME_PREFIX + username.trim(),
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
              fontSize: 20,
              marginBottom: 12,
            }}
          >
            MMR
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
            战队报名系统
          </h1>
          <p style={{ fontSize: 13, color: "var(--win-text-secondary)" }}>
            三角洲行动 MMR 战队
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
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
