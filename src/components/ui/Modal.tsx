"use client";

import { useEffect, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: string;
}

export function Modal({ open, onClose, title, children, footer, maxWidth = "540px" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="win-modal-backdrop" onClick={onClose}>
      <div
        className="win-modal flex flex-col"
        style={{ maxWidth }}
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
    </div>
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
