import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";

// 删除赛事（管理员）
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return fail("缺少赛事 ID");

  await prisma.event.delete({ where: { id } });
  return ok({ success: true });
});

// 归档/恢复赛事状态 + 修改赛事标签/赛制/分队性质/地图（管理员）
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const body = await req.json();
  const id = String(body?.id ?? "");
  if (!id) return fail("缺少赛事 ID");

  const status = body?.status as "UPCOMING" | "ARCHIVED" | undefined;
  const natureId = body?.natureId as string | undefined;
  const nameId = body?.nameId as string | undefined;
  // mapId: null = 清空地图；undefined = 不修改；string = 切换到指定地图
  const mapId = body?.mapId as string | null | undefined;
  const format = body?.format as "BO3" | "BO5" | "R2" | null | undefined;
  // 分队性质修改：[{ squadId, natureId }]
  const squadUpdates = body?.squads as { id: string; natureId: string }[] | undefined;

  if (status && !["UPCOMING", "ARCHIVED"].includes(status)) {
    return fail("无效状态");
  }
  if (format !== undefined && format !== null && !["BO3", "BO5", "R2"].includes(format)) {
    return fail("无效赛制");
  }

  // 校验标签存在且未被禁用
  if (natureId) {
    const n = await prisma.eventNature.findUnique({ where: { id: natureId } });
    if (!n) return fail("赛事性质不存在");
    if (n.disabled) return fail("赛事性质已被禁用，请选择其他标签");
  }
  if (nameId) {
    const n = await prisma.eventName.findUnique({ where: { id: nameId } });
    if (!n) return fail("赛事名称不存在");
    if (n.disabled) return fail("赛事名称已被禁用，请选择其他标签");
  }
  // 校验地图存在且未被禁用（仅当指定非 null 的 mapId 时校验）
  if (mapId) {
    const m = await prisma.eventMap.findUnique({ where: { id: mapId } });
    if (!m) return fail("赛事地图不存在");
    if (m.disabled) return fail("赛事地图已被禁用，请选择其他标签");
  }
  // 校验分队性质存在且未被禁用
  if (squadUpdates && squadUpdates.length > 0) {
    const snIds = [...new Set(squadUpdates.map((su) => su.natureId))];
    const sns = await prisma.squadNature.findMany({ where: { id: { in: snIds } } });
    const snMap = new Map(sns.map((s) => [s.id, s]));
    for (const su of squadUpdates) {
      const sn = snMap.get(su.natureId);
      if (!sn) return fail("分队性质不存在");
      if (sn.disabled) return fail(`分队性质「${sn.name}」已被禁用，请选择其他标签`);
    }
  }

  await prisma.$transaction(async (tx) => {
    // 更新赛事主字段
    const evData: any = {};
    if (status) evData.status = status;
    if (natureId) evData.natureId = natureId;
    if (nameId) evData.nameId = nameId;
    if (mapId !== undefined) evData.mapId = mapId; // null = 清空，string = 切换
    if (format !== undefined) evData.format = format;

    // 当 name 或 nature 变化时，同步重生成 title（任一变化都需重生成，避免标题残留旧名称）
    if (nameId || natureId) {
      const ev = await tx.event.findUnique({ where: { id }, include: { nature: true, name: true } });
      if (ev) {
        const name = nameId ? await tx.eventName.findUnique({ where: { id: nameId } }) : ev.name;
        const nature = natureId ? await tx.eventNature.findUnique({ where: { id: natureId } }) : ev.nature;
        if (name && nature) {
          evData.title = `${name.name} - ${nature.name} - ${ev.eventTime.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
        }
      }
    }

    if (Object.keys(evData).length > 0) {
      await tx.event.update({ where: { id }, data: evData });
    }

    // 更新分队性质（已在事务外校验存在性与禁用状态）
    if (squadUpdates && squadUpdates.length > 0) {
      for (const su of squadUpdates) {
        await tx.squad.update({ where: { id: su.id }, data: { natureId: su.natureId } });
      }
    }
  });

  return ok({ success: true });
});
