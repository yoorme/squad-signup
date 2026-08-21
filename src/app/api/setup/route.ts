import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSiteSettings, buildUsername } from "@/lib/site-settings";
import { ok, fail, withErrorHandler } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// ============ 系统初始化（创建初始管理员） ============
// 仅当系统中还没有任何用户时可用（首次部署后的第一次访问）。
// 一旦存在任何用户，本接口永久拒绝 —— 管理员只能由现有管理员在后台指定。
export const POST = withErrorHandler(async (req: NextRequest) => {
  // 限流：10 次 / 10 分钟 / IP
  const rl = rateLimit(`setup:${clientIp(req)}`, 10, 10 * 60_000);
  if (!rl.success) return fail("尝试过于频繁，请稍后再试", 429);

  const body = await req.json();
  const nickname = String(body?.nickname ?? "").trim();
  const password = String(body?.password ?? "");

  if (!nickname || !password) return fail("请填写完整信息");
  if (nickname.length > 16) return fail("昵称长度不能超过 16 个字符");
  if (/\s/.test(nickname)) return fail("昵称不能包含空白字符");
  if (password.length < 6) return fail("密码至少 6 位");
  if (password.length > 64) return fail("密码长度不能超过 64 个字符");

  const { teamPrefix } = await getSiteSettings();
  if (teamPrefix && nickname.startsWith(teamPrefix)) {
    return fail(`昵称无需包含「${teamPrefix}」前缀`);
  }
  const username = buildUsername(nickname, teamPrefix);

  // 事务内二次校验用户数为 0，防止并发初始化出多个管理员
  const user = await prisma.$transaction(async (tx) => {
    const count = await tx.user.count();
    if (count > 0) throw new Error("系统已初始化，请直接登录");

    const passwordHash = await bcrypt.hash(password, 10);
    return tx.user.create({
      data: {
        username,
        nickname,
        passwordHash,
        role: Role.ADMIN,
      },
    });
  });

  return ok({ id: user.id, username: user.username });
});
