import { NextResponse } from "next/server";

// 统一错误处理
export type ApiResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(error: string, status: number = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

// 包装 API 处理函数，统一处理权限错误
export function withErrorHandler<TArgs extends any[]>(
  handler: (...args: TArgs) => Promise<Response>
) {
  return async (...args: TArgs): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg === "UNAUTHORIZED") {
        return fail("未登录", 401);
      }
      if (msg === "FORBIDDEN") {
        return fail("无权限", 403);
      }
      console.error("[API Error]", e);
      return fail(msg || "服务器错误", 500);
    }
  };
}
