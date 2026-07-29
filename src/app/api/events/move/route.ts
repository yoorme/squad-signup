import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";

// 管理员拖拽移动队员
// body: { registrationId, targetSquadId?, expectedSquadId? }
//   - targetSquadId 为 null 表示移到替补
//   - expectedSquadId 为前端拖拽开始时该队员所在分队（用于检测中间状态变化）
//
// 并发策略（针对 SQLite 优化）：
// - 不使用长事务
// - 使用条件 updateMany 实现乐观锁：仅当 squadId 仍为 expected 时才更新
// - 容量校验使用原子 count
// - 两个管理员同时拖同一队员时，updateMany 只会有一个成功
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const body = await req.json();
  const { registrationId, targetSquadId } = body as {
    registrationId: string;
    targetSquadId: string | null;
  };
  // 拖拽开始时队员所在分队 ID（null 表示当时在替补）
  // undefined 时不做乐观锁校验
  const expectedSquadId: string | null | undefined =
    body.expectedSquadId === undefined ? undefined : body.expectedSquadId;

  if (!registrationId) return fail("缺少报名记录 ID");

  // 1. 查询当前状态（非事务）
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { event: true },
  });
  if (!reg) return fail("报名记录不存在", 404);
  if (reg.status !== "REGISTERED") return fail("该报名记录已取消", 410);
  if (reg.event.status === "ARCHIVED") return fail("赛事已结束", 400);

  // 2. 乐观锁：若拖拽过程中队员位置已被其他管理员改变，拒绝并提示前端刷新
  if (expectedSquadId !== undefined && reg.squadId !== expectedSquadId) {
    return fail(
      `队员位置已被其他管理员调整（当前在${reg.squadId ? "分队" : "替补"}），请刷新后重试`,
      409
    );
  }

  // 3. 已经在目标位置
  const currentSquadId = reg.squadId;
  if (currentSquadId === targetSquadId) {
    return ok({ success: true, unchanged: true });
  }

  // 4. 若目标是某分队，原子校验空位
  if (targetSquadId) {
    const target = await prisma.squad.findUnique({ where: { id: targetSquadId } });
    if (!target) return fail("目标分队不存在", 404);
    if (target.eventId !== reg.eventId) return fail("目标分队不属于同一赛事", 400);

    const count = await prisma.registration.count({
      where: { squadId: targetSquadId, status: "REGISTERED" },
    });
    // 如果不是从该分队内部移动，且已满，拒绝
    if (count >= target.capacity && currentSquadId !== targetSquadId) {
      return fail("目标分队已满", 409);
    }
  }

  // 5. 条件更新：仅当 status 仍为 REGISTERED 且 squadId 仍为 expected 时才更新
  // 这样即使两个管理员同时拖同一队员，也只有一个会成功
  const updateWhere: any = { id: registrationId, status: "REGISTERED" };
  if (expectedSquadId !== undefined) {
    updateWhere.squadId = expectedSquadId;
  }

  const updated = await prisma.registration.updateMany({
    where: updateWhere,
    data: {
      squadId: targetSquadId,
      isSubstitute: !targetSquadId,
    },
  });

  if (updated.count === 0) {
    // 在我们读取和更新之间，状态被其他操作改了
    return fail("队员状态已被其他操作修改，请刷新后重试", 409);
  }

  return ok({ success: true, unchanged: false });
});
