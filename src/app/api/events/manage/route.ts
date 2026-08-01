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
  // nameId: null = 清空名称（"未知"/"其他"）；undefined = 不修改；string = 关联标签
  const nameId = body?.nameId as string | null | undefined;
  // customName: null/空 = 无自定义；string = "其他"临时名称（最少 1 字符）；undefined = 不修改
  const customName = body?.customName as string | null | undefined;
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
  // 自定义名称校验：传了 customName 且非 null 时必须非空白
  if (customName !== undefined && customName !== null && customName.trim().length === 0) {
    return fail("自定义名称不能为空白");
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
    if (nameId !== undefined) evData.nameId = nameId || null; // null = 清空名称
    if (customName !== undefined) evData.customName = customName ? customName.trim() : null;
    if (mapId !== undefined) evData.mapId = mapId; // null = 清空，string = 切换
    if (format !== undefined) evData.format = format;

    // 当 name / customName / nature 任一变化时，同步重生成 title
    const titleDirty = nameId !== undefined || customName !== undefined || natureId !== undefined;
    if (titleDirty) {
      const ev = await tx.event.findUnique({ where: { id }, include: { nature: true, name: true } });
      if (ev) {
        const nature = natureId ? await tx.eventNature.findUnique({ where: { id: natureId } }) : ev.nature;
        if (nature) {
          // 确定显示名称：关联标签 > 自定义名称 > 未知（空）
          let displayName = "";
          if (nameId) {
            const nameRec = await tx.eventName.findUnique({ where: { id: nameId } });
            displayName = nameRec?.name ?? "";
          } else if (nameId === null) {
            // 显式清空：用 customName 或未知
            displayName = customName ? customName.trim() : "";
          } else if (customName !== undefined) {
            // nameId 未变，仅 customName 变化
            displayName = customName ? customName.trim() : ev.name?.name ?? "";
          } else {
            displayName = ev.name?.name ?? ev.customName ?? "";
          }
          const timeStr = ev.eventTime.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
          evData.title = displayName
            ? `${displayName} - ${nature.name} - ${timeStr}`
            : `${nature.name} - ${timeStr}`;
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
