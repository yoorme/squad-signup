import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";

// 标签类型
type TagType = "ability" | "duty" | "operator" | "nature" | "name" | "squadNature";

// 获取某类型标签列表（含使用情况）
async function getTags(type: TagType) {
  switch (type) {
    case "ability": {
      const items = await prisma.ability.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { users: true } } },
      });
      return items.map((i) => ({ ...i, usedCount: i._count.users }));
    }
    case "duty": {
      const items = await prisma.duty.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { users: true } } },
      });
      return items.map((i) => ({ ...i, usedCount: i._count.users }));
    }
    case "operator": {
      const items = await prisma.operator.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { users: true } } },
      });
      return items.map((i) => ({ ...i, usedCount: i._count.users }));
    }
    case "nature": {
      const items = await prisma.eventNature.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { events: true } } },
      });
      return items.map((i) => ({ ...i, usedCount: i._count.events }));
    }
    case "name": {
      const items = await prisma.eventName.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { events: true } } },
      });
      return items.map((i) => ({ ...i, usedCount: i._count.events }));
    }
    case "squadNature": {
      const items = await prisma.squadNature.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { squads: true } } },
      });
      return items.map((i) => ({ ...i, usedCount: i._count.squads }));
    }
  }
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const type = req.nextUrl.searchParams.get("type") as TagType;
  if (!type) return fail("缺少 type 参数");
  return ok(await getTags(type));
});

// 增删改标签
interface TagMutation {
  type: TagType;
  op: "create" | "update" | "delete";
  id?: string;
  name?: string;
  category?: "INFANTRY" | "VEHICLE";
  faction?: string;
  // 标签修改/删除时是否同步历史赛事
  syncHistory?: boolean;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const body = (await req.json()) as TagMutation;
  const { type, op } = body;

  if (op === "create") {
    if (!body.name) return fail("名称不能为空");
    const sortOrder = await getNextSortOrder(type);
    const created = await createTag(type, body.name, sortOrder, body.category, body.faction);
    return ok(created);
  }

  if (op === "update") {
    if (!body.id || !body.name) return fail("缺少 id 或 name");
    // 是否被历史赛事使用（仅赛事性质、赛事名称、分队性质需要考虑）
    if (["nature", "name", "squadNature"].includes(type)) {
      const usedCount = await checkTagUsed(type, body.id);
      if (usedCount > 0 && body.syncHistory === undefined) {
        // 询问是否同步
        return ok({ needConfirm: true, usedCount });
      }
    }
    const updated = await updateTag(type, body.id, body.name, body.category, body.faction);
    return ok(updated);
  }

  if (op === "delete") {
    if (!body.id) return fail("缺少 id");
    if (["nature", "name", "squadNature"].includes(type)) {
      const usedCount = await checkTagUsed(type, body.id);
      if (usedCount > 0 && body.syncHistory === undefined) {
        return ok({ needConfirm: true, usedCount });
      }
      if (usedCount > 0 && body.syncHistory === false) {
        // 仅删标签，但有关联记录，拒绝（需要先解除关联或同步删除）
        return fail("该标签已被使用，无法直接删除。请选择同步移除或先解除关联。");
      }
    } else {
      // 用户属性标签：如果被使用，禁止删除
      const usedCount = await checkTagUsed(type, body.id);
      if (usedCount > 0) {
        return fail(`该标签已被 ${usedCount} 名用户使用，无法删除`);
      }
    }
    await deleteTag(type, body.id);
    return ok({ success: true });
  }

  return fail("无效操作");
});

async function getNextSortOrder(type: TagType): Promise<number> {
  let max: number = 0;
  if (type === "ability") max = (await prisma.ability.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  if (type === "duty") max = (await prisma.duty.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  if (type === "operator") max = (await prisma.operator.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  if (type === "nature") max = (await prisma.eventNature.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  if (type === "name") max = (await prisma.eventName.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  if (type === "squadNature") max = (await prisma.squadNature.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  return max + 1;
}

async function createTag(type: TagType, name: string, sortOrder: number, category?: string, faction?: string) {
  if (type === "ability") {
    return prisma.ability.create({ data: { name, category: (category as any) || "INFANTRY", sortOrder } });
  }
  if (type === "duty") return prisma.duty.create({ data: { name, sortOrder } });
  if (type === "operator") return prisma.operator.create({ data: { name, faction, sortOrder } });
  if (type === "nature") return prisma.eventNature.create({ data: { name, sortOrder } });
  if (type === "name") return prisma.eventName.create({ data: { name, sortOrder } });
  if (type === "squadNature") return prisma.squadNature.create({ data: { name, sortOrder } });
  throw new Error("无效类型");
}

async function updateTag(type: TagType, id: string, name: string, category?: string, faction?: string) {
  if (type === "ability") {
    return prisma.ability.update({ where: { id }, data: { name, ...(category && { category: category as any }) } });
  }
  if (type === "duty") return prisma.duty.update({ where: { id }, data: { name } });
  if (type === "operator") return prisma.operator.update({ where: { id }, data: { name, faction } });
  if (type === "nature") return prisma.eventNature.update({ where: { id }, data: { name } });
  if (type === "name") return prisma.eventName.update({ where: { id }, data: { name } });
  if (type === "squadNature") return prisma.squadNature.update({ where: { id }, data: { name } });
  throw new Error("无效类型");
}

async function deleteTag(type: TagType, id: string) {
  if (type === "ability") return prisma.ability.delete({ where: { id } });
  if (type === "duty") return prisma.duty.delete({ where: { id } });
  if (type === "operator") return prisma.operator.delete({ where: { id } });
  if (type === "nature") return prisma.eventNature.delete({ where: { id } });
  if (type === "name") return prisma.eventName.delete({ where: { id } });
  if (type === "squadNature") return prisma.squadNature.delete({ where: { id } });
  throw new Error("无效类型");
}

async function checkTagUsed(type: TagType, id: string): Promise<number> {
  if (type === "ability") return prisma.userAbility.count({ where: { abilityId: id } });
  if (type === "duty") return prisma.userDuty.count({ where: { dutyId: id } });
  if (type === "operator") return prisma.userOperator.count({ where: { operatorId: id } });
  if (type === "nature") return prisma.event.count({ where: { natureId: id } });
  if (type === "name") return prisma.event.count({ where: { nameId: id } });
  if (type === "squadNature") return prisma.squad.count({ where: { natureId: id } });
  return 0;
}
