import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSiteSettings, buildUsername } from "@/lib/site-settings";
import { ok, fail, withErrorHandler } from "@/lib/api";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";

// 注册接口（限流：5 次/分钟/IP，防止爆破邀请码）
export const POST = withErrorHandler(async (req: NextRequest) => {
  const rl = rateLimit(`register:${clientIp(req)}`, 5, 60_000);
  if (!rl.success) return fail("尝试过于频繁，请稍后再试", 429);

  const body = await req.json();
  const invitationCode = String(body?.invitationCode ?? "").trim();
  const nickname = String(body?.nickname ?? "").trim();
  const password = String(body?.password ?? "");

  if (!invitationCode || !nickname || !password) {
    return fail("请填写完整信息");
  }
  if (password.length < 6) {
    return fail("密码至少 6 位");
  }
  const { teamPrefix } = await getSiteSettings();
  if (teamPrefix && nickname.startsWith(teamPrefix)) {
    return fail(`昵称无需包含「${teamPrefix}」前缀`);
  }
  const username = buildUsername(nickname, teamPrefix);

  // 事务：校验邀请码 + 创建用户 + 扣减邀请码
  const result = await prisma.$transaction(async (tx) => {
    const code = await tx.invitationCode.findUnique({
      where: { code: invitationCode },
    });
    if (!code) throw new Error("邀请码不存在");
    if (code.usedCount >= code.maxUses) throw new Error("邀请码已用尽");

    const existing = await tx.user.findUnique({ where: { username } });
    if (existing) throw new Error("该昵称已被使用");

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await tx.user.create({
      data: {
        username,
        nickname,
        passwordHash,
      },
    });

    // 条件扣减：usedCount < maxUses 才扣减，依赖数据库行锁防止并发超额
    // 若并发请求都已通过上面的检查，此处只有一个能成功 increment
    const updated = await tx.invitationCode.updateMany({
      where: { id: code.id, usedCount: { lt: code.maxUses } },
      data: { usedCount: { increment: 1 } },
    });
    if (updated.count === 0) throw new Error("邀请码已用尽");

    return user;
  });

  return ok({ id: result.id, username: result.username });
});
