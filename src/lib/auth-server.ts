import { auth } from "@/auth";
import { Role } from "@prisma/client";

// 获取当前会话用户（含 role）
export async function getSession() {
  return await auth();
}

// 获取当前用户 ID
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  return (session?.user as any)?.id ?? null;
}

// 是否已登录
export async function isLoggedIn(): Promise<boolean> {
  const session = await auth();
  return !!session?.user;
}

// 是否为管理员
export async function isAdmin(): Promise<boolean> {
  const session = await auth();
  return (session?.user as any)?.role === Role.ADMIN;
}

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
