import { auth } from "@/auth";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// 获取当前登录用户，并实时从数据库校验账号状态与角色。
// 这样禁用/降级用户后，旧 JWT 也会立即失效。
export async function getSessionUser() {
  const session = await auth();
  if (!session?.user) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      username: true,
      nickname: true,
      role: true,
      disabled: true,
    },
  });

  if (!dbUser || dbUser.disabled) return null;
  return dbUser;
}

// 强制要求登录，否则抛错
export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return { ...user, name: user.username };
}

// 强制要求管理员，否则抛错
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== Role.ADMIN) {
    throw new Error("FORBIDDEN");
  }
  return user;
}
