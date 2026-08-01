import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-server";
import { ok, withErrorHandler } from "@/lib/api";

// 队员列表 - 所有已登录成员可见（仅返回公开信息，不含密码/禁用状态等管理字段）
export const GET = withErrorHandler(async () => {
  await requireUser();
  const users = await prisma.user.findMany({
    where: { disabled: false },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      nickname: true,
      role: true,
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

  const data = users.map((u) => ({
    id: u.id,
    username: u.username,
    nickname: u.nickname,
    role: u.role,
    createdAt: u.createdAt,
    abilities: u.abilities.map((ua) => ua.ability),
    duties: u.duties.map((ud) => ud.duty),
    operators: u.operators.map((uo) => uo.operator),
  }));

  return ok(data);
});
