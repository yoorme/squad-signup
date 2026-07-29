import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";
import { generateInvitationCode } from "@/lib/constants";

// 邀请码管理 - 获取列表
export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const codes = await prisma.invitationCode.findMany({
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { username: true, nickname: true } } },
  });
  return ok(
    codes.map((c) => ({
      id: c.id,
      code: c.code,
      maxUses: c.maxUses,
      usedCount: c.usedCount,
      remaining: Math.max(0, c.maxUses - c.usedCount),
      createdAt: c.createdAt,
      createdBy: c.createdBy,
    }))
  );
});

// 生成邀请码
export const POST = withErrorHandler(async (req: NextRequest) => {
  const user = await requireAdmin();
  const body = await req.json();
  const maxUses = Number(body?.maxUses ?? 1);
  if (!Number.isInteger(maxUses) || maxUses <= 0) return fail("次数必须是正整数");

  // 防止重复，最多重试 5 次
  let code = "";
  for (let i = 0; i < 5; i++) {
    code = generateInvitationCode(8);
    const exists = await prisma.invitationCode.findUnique({ where: { code } });
    if (!exists) break;
  }
  if (!code) return fail("生成邀请码失败，请重试", 500);

  const created = await prisma.invitationCode.create({
    data: { code, maxUses, createdById: user.id },
  });
  return ok(created);
});

// 删除邀请码
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return fail("缺少 ID");
  await prisma.invitationCode.delete({ where: { id } });
  return ok({ success: true });
});
