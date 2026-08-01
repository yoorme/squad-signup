import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";

// 管理员调整队员分配：将某报名记录移到目标分队或替补池
// PATCH { registrationId, targetSquadId }
//   - targetSquadId 为字符串：移到该分队（正式）
//   - targetSquadId 为 null：移到替补池
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const body = await req.json();
  const { registrationId, targetSquadId } = body as {
    registrationId: string;
    targetSquadId: string | null;
  };

  if (!registrationId) return fail("缺少 registrationId");
  // targetSquadId 必须存在（即使是 null 也需显式传）

  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { squad: true },
  });
  if (!reg) return fail("报名记录不存在");
  if (reg.status !== "REGISTERED") return fail("该报名已取消，无法分配");

  // 移到替补池
  if (targetSquadId === null) {
    if (reg.squadId === null && reg.isSubstitute) {
      return ok({ success: true, unchanged: true });
    }
    await prisma.registration.update({
      where: { id: registrationId },
      data: { squadId: null, isSubstitute: true },
    });
    return ok({ success: true });
  }

  // 移到指定分队：校验分队归属同一赛事且未超容量
  const targetSquad = await prisma.squad.findUnique({
    where: { id: targetSquadId },
    include: { _count: { select: { registrations: { where: { status: "REGISTERED" } } } } },
  });
  if (!targetSquad) return fail("目标分队不存在");
  if (targetSquad.eventId !== reg.eventId) return fail("目标分队不属于该赛事");

  // 已在该分队则无需操作
  if (reg.squadId === targetSquadId) return ok({ success: true, unchanged: true });

  // 容量校验：移入后不超过 capacity
  if (targetSquad._count.registrations >= targetSquad.capacity) {
    return fail("目标分队已满员");
  }

  await prisma.registration.update({
    where: { id: registrationId },
    data: { squadId: targetSquadId, isSubstitute: false },
  });
  return ok({ success: true });
});
