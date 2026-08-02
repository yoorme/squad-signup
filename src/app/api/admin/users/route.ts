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

// 硬删除账号
// query: ?id=xxx
// 策略：
//   - 级联表（userAbility/userDuty/userOperator/announcementReads/
//     announcementComments/eventReads/registrations）由 Prisma onDelete: Cascade 自动清理
//   - 非级联表（外键无 onDelete 声明，删除会被拒绝）需先转移给当前管理员：
//     * InvitationCode.createdBy   → 转移给操作者
//     * Announcement.author         → 转移给操作者
//     * Event.createdBy             → 转移给操作者
//   - 不能删除自己、不能删除最后一位管理员
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const currentUser = await requireAdmin();
  const url = req.nextUrl;
  const id = url.searchParams.get("id");
  if (!id) return fail("缺少用户 ID");

  // 不能删除自己
  if (id === currentUser.id) {
    return fail("不能删除当前登录账号");
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return fail("用户不存在", 404);

  // 不能删除最后一位管理员
  if (target.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN", disabled: false } });
    if (adminCount <= 1) {
      return fail("不能删除最后一位管理员");
    }
  }

  // 统计将删除的关联数据数量（用于响应和日志）
  const [regCount, annCount, eventCount, inviteCount] = await Promise.all([
    prisma.registration.count({ where: { userId: id } }),
    prisma.announcement.count({ where: { authorId: id } }),
    prisma.event.count({ where: { createdById: id } }),
    prisma.invitationCode.count({ where: { createdById: id } }),
  ]);

  await prisma.$transaction(async (tx) => {
    // 1. 转移非级联外键（无 onDelete: Cascade 的关系）给当前操作者
    //    避免外键约束阻止删除，同时保留历史公告/赛事/邀请码的归属
    await tx.invitationCode.updateMany({
      where: { createdById: id },
      data: { createdById: currentUser.id },
    });
    await tx.announcement.updateMany({
      where: { authorId: id },
      data: { authorId: currentUser.id },
    });
    await tx.event.updateMany({
      where: { createdById: id },
      data: { createdById: currentUser.id },
    });

    // 2. 删除 user 记录
    //    级联表（userAbility/userDuty/userOperator/announcementReads/
    //    announcementComments/eventReads/registrations）由数据库自动级联删除
    await tx.user.delete({ where: { id } });
  });

  return ok({
    success: true,
    deleted: {
      username: target.username,
      registrations: regCount,
      announcements: annCount,
      events: eventCount,
      invitationCodes: inviteCount,
    },
  });
});
