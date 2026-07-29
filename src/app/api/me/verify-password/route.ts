import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";
import bcrypt from "bcryptjs";

// 校验原密码
export const POST = withErrorHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await req.json();
  const password = String(body?.password ?? "");
  if (!password) return fail("请输入密码");

  const detail = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!detail) return fail("用户不存在", 404);

  const valid = await bcrypt.compare(password, detail.passwordHash);
  if (!valid) return fail("原密码错误");

  return ok({ valid: true });
});
