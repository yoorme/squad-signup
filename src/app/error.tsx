"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        color: "var(--win-text, #1b1b1b)",
      }}
    >
      <div style={{ fontSize: 40 }} aria-hidden>
        ⚠️
      </div>
      <p style={{ color: "var(--win-text-secondary, #5d5d5d)" }}>
        页面出错了，请重试
      </p>
      <button className="win-btn win-btn-primary" onClick={reset}>
        重新加载
      </button>
    </div>
  );
}
