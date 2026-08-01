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
// - "同一用户同一赛事最多一条有效报名"由部分唯一索引兜底（见 schema 注释）
// - 容量复查按 createdAt 升序保留前 N 名，仅降级超出名额者，
//   避免并发抢名额时所有请求"集体自我降级"导致分队留空
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

  // 2. 校验是否已有有效报名
  const existing = await prisma.registration.findFirst({
    where: { eventId, userId: user.id, status: "REGISTERED" },
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

  const newIsSubstitute = asSubstitute || !targetSquadId;

  // 4. 写入报名记录：有取消记录则复活，否则新建
  // 并发兜底：部分唯一索引会拒绝第二个并发的有效报名（P2002）
  try {
    const cancelled = await prisma.registration.findFirst({
      where: { eventId, userId: user.id, status: "CANCELLED" },
      orderBy: { createdAt: "desc" },
    });

    let registrationId: string;
    if (cancelled) {
      // 复活取消记录（条件更新：被并发抢先复活/变动时 count=0）
      const revived = await prisma.registration.updateMany({
        where: { id: cancelled.id, status: "CANCELLED" },
        data: {
          squadId: targetSquadId,
          isSubstitute: newIsSubstitute,
          status: "REGISTERED",
          createdAt: new Date(), // 重新排队，以复活时间参与容量排序
        },
      });
      if (revived.count === 0) {
        return fail("操作冲突，请刷新后重试", 409);
      }
      registrationId = cancelled.id;
    } else {
      const reg = await prisma.registration.create({
        data: {
          eventId,
          userId: user.id,
          squadId: targetSquadId,
          isSubstitute: newIsSubstitute,
          status: "REGISTERED",
        },
      });
      registrationId = reg.id;
    }

    // 5. 写入后复查容量（防止并发时多个请求都通过了第3步的检查）
    // 按 createdAt 升序保留前 capacity 名，仅将超出名额的新报名者降级为替补，
    // 保证先到者不被误伤、分队不留空位
    if (targetSquadId) {
      const squad = await prisma.squad.findUnique({ where: { id: targetSquadId } });
      if (squad) {
        const activeRegs = await prisma.registration.findMany({
          where: { squadId: targetSquadId, status: "REGISTERED" },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        if (activeRegs.length > squad.capacity) {
          const overflowIds = activeRegs.slice(squad.capacity).map((r) => r.id);
          await prisma.registration.updateMany({
            where: { id: { in: overflowIds } },
            data: { squadId: null, isSubstitute: true },
          });
          if (overflowIds.includes(registrationId)) {
            return ok({
              success: false,
              fellbackToSubstitute: true,
              message: "该分队已被其他队员抢先报名，已自动加入替补",
              registrationId,
            });
          }
        }
      }
    }

    return ok({
      success: !fellbackToSubstitute,
      registrationId,
      isSubstitute: newIsSubstitute,
      fellbackToSubstitute,
      message: fellbackToSubstitute ? "该分队已满，已自动加入替补" : undefined,
    });
  } catch (e: any) {
    // 唯一索引冲突 = 并发重复报名
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail("您已报名，请先取消再重新选择");
    }
    throw e;
  }
});

// 取消报名（软删除：status → CANCELLED，保留记录便于审计与再次报名时复活）
// query: ?registrationId=xxx
// 使用条件更新：仅当 status 仍为 REGISTERED 时才取消
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

  // 条件更新：仅当 status 仍为 REGISTERED 时才取消
  // 若已被其他流程取消，count=0，提示用户
  const updated = await prisma.registration.updateMany({
    where: { id, status: "REGISTERED" },
    data: { status: "CANCELLED" },
  });
  if (updated.count === 0) {
    return fail("该报名记录已被取消", 409);
  }

  return ok({ success: true });
});
