import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";

// 队员详情 - 所有已登录成员可见（仅返回公开信息）
export const GET = withErrorHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requireUser();
  const { id } = await ctx.params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      nickname: true,
      role: true,
      disabled: true,
      createdAt: true,
      abilities: {
        include: { ability: { select: { id: true, name: true, category: true } } },
        orderBy: { ability: { sortOrder: "asc" } },
      },
      duties: {
        include: { duty: { select: { id: true, name: true } } },
        orderBy: { duty: { sortOrder: "asc" } },
      },
      operators: {
        include: { operator: { select: { id: true, name: true, faction: true } } },
        orderBy: { operator: { sortOrder: "asc" } },
      },
    },
  });

  if (!user || user.disabled) return fail("队员不存在", 404);

  return ok({
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    role: user.role,
    createdAt: user.createdAt,
    abilities: user.abilities.map((ua) => ua.ability),
    duties: user.duties.map((ud) => ud.duty),
    operators: user.operators.map((uo) => uo.operator),
  });
});
