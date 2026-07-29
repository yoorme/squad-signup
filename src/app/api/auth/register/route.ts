import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildUsername } from "@/lib/constants";
import { ok, fail, withErrorHandler } from "@/lib/api";
import bcrypt from "bcryptjs";

// 注册接口
export const POST = withErrorHandler(async (req: NextRequest) => {
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
  if (nickname.startsWith("MMR丨")) {
    return fail("昵称无需包含 MMR丨 前缀");
  }
  const username = buildUsername(nickname);

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

    await tx.invitationCode.update({
      where: { id: code.id },
      data: { usedCount: { increment: 1 } },
    });

    return user;
  });

  return ok({ id: result.id, username: result.username });
});
