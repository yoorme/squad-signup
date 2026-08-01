"use client";

import type { CSSProperties, ReactNode } from "react";

// 统一的状态展示组件：加载中 / 加载失败（可重试） / 空数据
// 替代各页面重复内联的 "加载中..." 与缺失的错误分支

const baseStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  padding: "48px 24px",
  color: "var(--win-text-secondary)",
  fontSize: 14,
  textAlign: "center",
};

export function Loading({ text = "加载中..." }: { text?: string }) {
  return (
    <div style={baseStyle} role="status" aria-live="polite">
      <span className="win-spinner" aria-hidden />
      <span>{text}</span>
    </div>
  );
}

export function ErrorState({
  message = "加载失败",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div style={baseStyle} role="alert">
      <span style={{ fontSize: 28 }} aria-hidden>
        ⚠️
      </span>
      <span>{message}</span>
      {onRetry && (
        <button className="win-btn win-btn-secondary" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  );
}

export function Empty({
  icon,
  text,
  children,
}: {
  icon?: ReactNode;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div style={baseStyle}>
      {icon && (
        <span style={{ fontSize: 28, opacity: 0.6 }} aria-hidden>
          {icon}
        </span>
      )}
      <span>{text}</span>
      {children}
    </div>
  );
}
