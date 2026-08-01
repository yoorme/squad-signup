import { NextRequest, NextResponse } from "next/server";
import { handlers } from "@/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const { GET } = handlers;

// 仅对 credentials 登录回调限流（5 次/分钟/IP），防止密码爆破
// 其他 POST（如 signout、session 刷新）不受影响
export async function POST(req: NextRequest) {
  if (req.nextUrl.pathname.endsWith("/callback/credentials")) {
    const rl = rateLimit(`login:${clientIp(req)}`, 5, 60_000);
    if (!rl.success) {
      return NextResponse.json(
        { ok: false, error: "尝试过于频繁，请稍后再试" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
      );
    }
  }
  return handlers.POST(req);
}
