import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";
import bcrypt from "bcryptjs";

// 用户管理 - 获取列表
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      nickname: true,
      role: true,
      disabled: true,
      createdAt: true,
      _count: {
        select: {
          registrations: { where: { status: "REGISTERED" } },
          announcementReads: true,
        },
      },
    },
  });
  return ok(users);
});

// 修改用户（角色切换 / 禁用）
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const body = await req.json();
  const id = String(body?.id ?? "");
  if (!id) return fail("缺少用户 ID");

  // 严格校验输入类型与取值，防止脏数据写库
  const data: { role?: "ADMIN" | "MEMBER"; disabled?: boolean } = {};
  if (body.role !== undefined) {
    if (body.role !== "ADMIN" && body.role !== "MEMBER") {
      return fail("无效的角色取值");
    }
    data.role = body.role;
  }
  if (body.disabled !== undefined) {
    if (typeof body.disabled !== "boolean") {
      return fail("disabled 必须是布尔值");
    }
    data.disabled = body.disabled;
  }
  if (Object.keys(data).length === 0) return fail("没有需要修改的字段");

  // 不能禁用/降级最后一个管理员
  if (data.role === "MEMBER" || data.disabled === true) {
    const target = await prisma.user.findUnique({ where: { id } });
    if (target?.role === "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN", disabled: false } });
      if (adminCount <= 1) {
        return fail("不能禁用或降级最后一位管理员");
      }
    }
  }

  await prisma.user.update({ where: { id }, data });
  return ok({ success: true });
});

// 重置密码
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const body = await req.json();
  const id = String(body?.id ?? "");
  const newPassword = String(body?.password ?? "");
  if (!id) return fail("缺少用户 ID");
  if (newPassword.length < 6) return fail("密码至少 6 位");

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  return ok({ success: true });
});
