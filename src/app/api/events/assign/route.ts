import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";

// 管理员调整队员分配
//
// 批量模式（前端分配视图使用）：
// PATCH { eventId, moves: [{ registrationId, targetSquadId }] }
//   - targetSquadId: string → 移到该分队；null → 移到替补池
//   - 事务内计算 moves 应用后的终态分布，任一分队超容量则整体回滚
//   - 用于"超容暂存 + 合规后自动保存"：前端允许本地超容调换，
//     所有分队人数 ≤ capacity 时才提交本接口
//
// 单条模式（兼容旧调用）：
// PATCH { registrationId, targetSquadId }
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const body = await req.json();

  // ---------- 批量模式 ----------
  if (Array.isArray(body?.moves)) {
    const eventId = String(body.eventId ?? "");
    const moves = body.moves as { registrationId: string; targetSquadId: string | null }[];
    if (!eventId) return fail("缺少 eventId");
    if (moves.length === 0) return ok({ success: true, unchanged: true });

    // 一次查询拿全赛事上下文：赛事（含分队容量）+ 所有有效报名
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, squads: { select: { id: true, capacity: true } } },
    });
    if (!event) return fail("赛事不存在");

    const registrations = await prisma.registration.findMany({
      where: { eventId, status: "REGISTERED" },
      select: { id: true, squadId: true, isSubstitute: true },
    });
    const regMap = new Map(registrations.map((r) => [r.id, r]));
    const capacityMap = new Map(event.squads.map((s) => [s.id, s.capacity]));

    // 计算终态分布：初始分布 + 逐条应用 moves
    // squadId 语义与数据一致：null = 替补池
    const finalSquad = new Map<string, string | null>(
      registrations.map((r) => [r.id, r.squadId])
    );
    for (const mv of moves) {
      const { registrationId, targetSquadId } = mv;
      if (!registrationId) return fail("缺少 registrationId");
      if (!regMap.has(registrationId)) return fail("报名记录不存在或不属于该赛事");
      if (targetSquadId !== null && !capacityMap.has(targetSquadId)) {
        return fail("目标分队不存在或不属于该赛事");
      }
      finalSquad.set(registrationId, targetSquadId);
    }

    // 终态容量校验：任一分队超容 → 整体拒绝（前端暂存态不允许落库）
    const squadCount = new Map<string, number>();
    for (const squadId of finalSquad.values()) {
      if (squadId === null) continue;
      squadCount.set(squadId, (squadCount.get(squadId) ?? 0) + 1);
    }
    for (const [squadId, count] of squadCount) {
      const capacity = capacityMap.get(squadId) ?? 0;
      if (count > capacity) {
        return fail("存在超员分队，未保存。请调整至所有分队人数不超过容量后自动保存");
      }
    }

    // 只写有实际变化的记录，减少事务内写次数
    const updates = moves.filter((mv) => {
      const before = regMap.get(mv.registrationId);
      return before && before.squadId !== mv.targetSquadId;
    });
    if (updates.length === 0) return ok({ success: true, unchanged: true });

    await prisma.$transaction(
      updates.map((mv) =>
        prisma.registration.update({
          where: { id: mv.registrationId },
          data: { squadId: mv.targetSquadId, isSubstitute: mv.targetSquadId === null },
        })
      )
    );
    return ok({ success: true, updated: updates.length });
  }

  // ---------- 单条模式（兼容） ----------
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
