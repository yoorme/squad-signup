import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";

// 报名接口
// body: { eventId, squadId?, asSubstitute? }
//
// 并发策略：
// - 不使用长事务
// - 依赖复合唯一约束 [eventId, userId, status] 防止重复报名
// - 容量校验使用原子 count，最后由业务层 + 约束兜底
// - 满员时自动回退为替补
export const POST = withErrorHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await req.json();
  const eventId = String(body?.eventId ?? "");
  const squadId = body?.squadId ? String(body.squadId) : null;
  const asSubstitute = !!body?.asSubstitute;

  if (!eventId) return fail("缺少赛事 ID");

  // 1. 基础校验（非事务，快速失败）
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return fail("赛事不存在", 404);
  if (event.status === "ARCHIVED") return fail("赛事已结束", 400);

  // 2. 校验是否已报名
  const existing = await prisma.registration.findUnique({
    where: { eventId_userId_status: { eventId, userId: user.id, status: "REGISTERED" } },
  });
  if (existing) return fail("您已报名，请先取消再重新选择");

  // 3. 决定目标分队（校验存在性 + 归属 + 容量）
  //    满员时 fellbackToSubstitute=true，targetSquadId 保持 null，
  //    统一交由第4步创建替补记录（避免"提示加入替补但未实际创建"的 Bug）
  let targetSquadId: string | null = null;
  let fellbackToSubstitute = false;
  if (squadId && !asSubstitute) {
    const squad = await prisma.squad.findUnique({ where: { id: squadId } });
    if (!squad) return fail("分队不存在", 404);
    if (squad.eventId !== eventId) return fail("分队不属于此赛事");

    // 原子计数
    const count = await prisma.registration.count({
      where: { squadId, status: "REGISTERED" },
    });
    if (count >= squad.capacity) {
      // 满员 → 降级为替补（targetSquadId 保持 null，由第4步创建替补记录）
      fellbackToSubstitute = true;
    } else {
      targetSquadId = squadId;
    }
  }

  // 4. 创建报名记录
  // 并发兜底：复合唯一约束 [eventId, userId, status] 会拒绝第二个并发报名
  try {
    const reg = await prisma.registration.create({
      data: {
        eventId,
        userId: user.id,
        squadId: targetSquadId,
        isSubstitute: asSubstitute || !targetSquadId,
        status: "REGISTERED",
      },
    });

    // 5. 创建后再次校验容量（防止并发时多个请求都通过了第3步的检查）
    // 若发现超额，将此报名降级为替补
    if (targetSquadId) {
      const finalCount = await prisma.registration.count({
        where: { squadId: targetSquadId, status: "REGISTERED" },
      });
      const squad = await prisma.squad.findUnique({ where: { id: targetSquadId } });
      if (squad && finalCount > squad.capacity) {
        // 超额：降级为替补
        await prisma.registration.update({
          where: { id: reg.id },
          data: { squadId: null, isSubstitute: true },
        });
        return ok({
          success: false,
          fellbackToSubstitute: true,
          message: "该分队已被其他队员抢先报名，已自动加入替补",
          registrationId: reg.id,
        });
      }
    }

    return ok({
      success: !fellbackToSubstitute,
      registrationId: reg.id,
      isSubstitute: asSubstitute || !targetSquadId,
      fellbackToSubstitute,
      message: fellbackToSubstitute ? "该分队已满，已自动加入替补" : undefined,
    });
  } catch (e: any) {
    // 唯一约束冲突 = 并发重复报名
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail("您已报名，请先取消再重新选择");
    }
    throw e;
  }
});

// 取消报名
// query: ?registrationId=xxx
// 使用条件删除：仅当 status 仍为 REGISTERED 时才删除
// 这样即使管理员同时移动该队员，也只有一个操作会成功
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const id = req.nextUrl.searchParams.get("registrationId");
  if (!id) return fail("缺少报名记录 ID");

  // 先查询确认权限（无事务，快速失败）
  const reg = await prisma.registration.findUnique({ where: { id } });
  if (!reg) return fail("报名记录不存在", 404);
  if (reg.userId !== user.id && user.role !== "ADMIN") {
    return fail("无权操作他人报名", 403);
  }

  // 校验赛事未归档
  const event = await prisma.event.findUnique({ where: { id: reg.eventId } });
  if (event?.status === "ARCHIVED") return fail("赛事已结束，无法取消");

  // 条件删除：仅当 status 仍为 REGISTERED 时才删除
  // 若管理员在此期间移动了该队员（updateMany 不会改变 status），删除仍会成功
  // 若已被其他流程取消/删除，count=0，提示用户
  const deleted = await prisma.registration.deleteMany({
    where: { id, status: "REGISTERED" },
  });
  if (deleted.count === 0) {
    return fail("该报名记录已被取消或已被管理员调整", 409);
  }

  return ok({ success: true });
});
