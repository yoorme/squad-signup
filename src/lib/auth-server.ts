import { auth } from "@/auth";
import { Role } from "@prisma/client";

// 强制要求登录，否则抛错
export async function requireUser() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("UNAUTHORIZED");
  }
  return session.user as any as {
    id: string;
    name: string;
    nickname: string;
    role: Role;
  };
}

// 强制要求管理员，否则抛错
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== Role.ADMIN) {
    throw new Error("FORBIDDEN");
  }
  return user;
}
