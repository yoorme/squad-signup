import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";

// 标签类型
type TagType = "ability" | "duty" | "operator" | "nature" | "name" | "squadNature" | "map";

// 获取某类型标签列表（含使用情况 + disabled 状态）
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
    case "map": {
      const items = await prisma.eventMap.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: { _count: { select: { events: true } } },
      });
      return items.map((i) => ({ ...i, usedCount: i._count.events }));
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
  op: "create" | "update" | "delete" | "toggleDisable" | "reorder";
  id?: string;
  name?: string;
  category?: "INFANTRY" | "VEHICLE";
  faction?: string;
  disabled?: boolean;
  // reorder：按顺序的 id 数组，服务端按数组下标重写 sortOrder
  orderedIds?: string[];
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
    // 直接重命名：标签 id 不变，关联赛事自动显示新名称（外键按 id 关联）
    const updated = await updateTag(type, body.id, body.name, body.category, body.faction);
    return ok(updated);
  }

  if (op === "toggleDisable") {
    if (!body.id) return fail("缺少 id");
    const disabled = await toggleDisableTag(type, body.id, !!body.disabled);
    return ok({ success: true, disabled });
  }

  if (op === "delete") {
    if (!body.id) return fail("缺少 id");
    // 被使用的标签无法删除（外键约束），提示改用禁用
    const usedCount = await checkTagUsed(type, body.id);
    if (usedCount > 0) {
      const who = ["nature", "name", "squadNature", "map"].includes(type) ? "赛事" : "名用户";
      return fail(`该标签已被 ${usedCount} 个${who}使用，无法删除。请改用「禁用」`);
    }
    await deleteTag(type, body.id);
    return ok({ success: true });
  }

  if (op === "reorder") {
    if (!body.orderedIds || body.orderedIds.length === 0) return fail("缺少 orderedIds");
    await reorderTags(type, body.orderedIds);
    return ok({ success: true });
  }

  return fail("无效操作");
});

// 批量重写 sortOrder：按 orderedIds 下标作为新顺序
async function reorderTags(type: TagType, orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, idx) => updateSortOrder(type, id, idx))
  );
}

async function updateSortOrder(type: TagType, id: string, sortOrder: number) {
  const data = { sortOrder };
  if (type === "ability") return prisma.ability.update({ where: { id }, data });
  if (type === "duty") return prisma.duty.update({ where: { id }, data });
  if (type === "operator") return prisma.operator.update({ where: { id }, data });
  if (type === "nature") return prisma.eventNature.update({ where: { id }, data });
  if (type === "name") return prisma.eventName.update({ where: { id }, data });
  if (type === "squadNature") return prisma.squadNature.update({ where: { id }, data });
  if (type === "map") return prisma.eventMap.update({ where: { id }, data });
  throw new Error("无效类型");
}

async function getNextSortOrder(type: TagType): Promise<number> {
  let max: number = 0;
  if (type === "ability") max = (await prisma.ability.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  if (type === "duty") max = (await prisma.duty.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  if (type === "operator") max = (await prisma.operator.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  if (type === "nature") max = (await prisma.eventNature.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  if (type === "name") max = (await prisma.eventName.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  if (type === "squadNature") max = (await prisma.squadNature.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  if (type === "map") max = (await prisma.eventMap.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
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
  if (type === "map") return prisma.eventMap.create({ data: { name, sortOrder } });
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
  if (type === "map") return prisma.eventMap.update({ where: { id }, data: { name } });
  throw new Error("无效类型");
}

async function deleteTag(type: TagType, id: string) {
  if (type === "ability") return prisma.ability.delete({ where: { id } });
  if (type === "duty") return prisma.duty.delete({ where: { id } });
  if (type === "operator") return prisma.operator.delete({ where: { id } });
  if (type === "nature") return prisma.eventNature.delete({ where: { id } });
  if (type === "name") return prisma.eventName.delete({ where: { id } });
  if (type === "squadNature") return prisma.squadNature.delete({ where: { id } });
  if (type === "map") return prisma.eventMap.delete({ where: { id } });
  throw new Error("无效类型");
}

// 切换标签禁用状态：禁用后不可在新记录中使用，已使用的不受影响
async function toggleDisableTag(type: TagType, id: string, disabled: boolean) {
  const data = { disabled };
  if (type === "ability") return (await prisma.ability.update({ where: { id }, data })).disabled;
  if (type === "duty") return (await prisma.duty.update({ where: { id }, data })).disabled;
  if (type === "operator") return (await prisma.operator.update({ where: { id }, data })).disabled;
  if (type === "nature") return (await prisma.eventNature.update({ where: { id }, data })).disabled;
  if (type === "name") return (await prisma.eventName.update({ where: { id }, data })).disabled;
  if (type === "squadNature") return (await prisma.squadNature.update({ where: { id }, data })).disabled;
  if (type === "map") return (await prisma.eventMap.update({ where: { id }, data })).disabled;
  throw new Error("无效类型");
}

async function checkTagUsed(type: TagType, id: string): Promise<number> {
  if (type === "ability") return prisma.userAbility.count({ where: { abilityId: id } });
  if (type === "duty") return prisma.userDuty.count({ where: { dutyId: id } });
  if (type === "operator") return prisma.userOperator.count({ where: { operatorId: id } });
  if (type === "nature") return prisma.event.count({ where: { natureId: id } });
  if (type === "name") return prisma.event.count({ where: { nameId: id } });
  if (type === "squadNature") return prisma.squad.count({ where: { natureId: id } });
  if (type === "map") return prisma.event.count({ where: { mapId: id } });
  return 0;
}
