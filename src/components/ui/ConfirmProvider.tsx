"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Confirm } from "./Modal";

interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmOptions | null>(null);
  const [resolver, setResolver] = useState<((v: boolean) => void) | null>(null);

  const confirm: ConfirmFn = useCallback((options) => {
    setState(options);
    return new Promise<boolean>((resolve) => {
      setResolver(() => resolve);
    });
  }, []);

  const handleClose = (result: boolean) => {
    if (resolver) resolver(result);
    setState(null);
    setResolver(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Confirm
        open={!!state}
        title={state?.title}
        message={state?.message}
        confirmText={state?.confirmText}
        cancelText={state?.cancelText}
        danger={state?.danger}
        onConfirm={() => handleClose(true)}
        onCancel={() => handleClose(false)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm 必须在 ConfirmProvider 内使用");
  return ctx;
}
