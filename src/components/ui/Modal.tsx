"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}

export function Modal({ open, onClose, title, children, footer, maxWidth = "540px" }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // Esc 关闭 + 打开时锁定 body 滚动 + 焦点管理
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // 简易焦点陷阱：Tab 在弹窗内循环
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    previousFocusRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    // 打开后将焦点移入弹窗
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      // 关闭后把焦点还给触发元素
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  // Portal 到 body：避免被父级 overflow/transform/stacking context 裁剪或遮挡
  return createPortal(
    <div className="win-modal-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="win-modal flex flex-col"
        style={{ maxWidth, outline: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: "1px solid var(--win-border)" }}
          >
            <h3 className="text-base font-semibold" style={{ color: "var(--win-text)" }}>
              {title}
            </h3>
            <button
              onClick={onClose}
              className="win-btn"
              style={{ padding: "4px 8px", minWidth: 32, minHeight: 32 }}
              aria-label="关闭"
            >
              ✕
            </button>
          </div>
        )}
        <div className="px-5 py-4 flex-1 overflow-auto">{children}</div>
        {footer && (
          <div
            className="flex justify-end gap-2 px-5 py-3"
            style={{ borderTop: "1px solid var(--win-border)" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// 确认对话框
interface ConfirmProps {
  open: boolean;
  title?: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function Confirm({
  open,
  title = "确认",
  message,
  confirmText = "确认",
  cancelText = "取消",
  danger,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      maxWidth="420px"
      footer={
        <>
          <button className="win-btn win-btn-secondary" onClick={onCancel}>
            {cancelText}
          </button>
          <button
            className={danger ? "win-btn win-btn-danger" : "win-btn win-btn-primary"}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <div className="text-sm" style={{ color: "var(--win-text-secondary)" }}>
        {message}
      </div>
    </Modal>
  );
}
