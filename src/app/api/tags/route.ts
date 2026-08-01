import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-server";
import { ok, withErrorHandler } from "@/lib/api";

// 获取所有标签（赛事性质、赛事名称、分队性质、地图）
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireUser();
  const [natures, names, squadNatures, maps] = await Promise.all([
    prisma.eventNature.findMany({ where: { disabled: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.eventName.findMany({ where: { disabled: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.squadNature.findMany({ where: { disabled: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.eventMap.findMany({ where: { disabled: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);

  // 标记每个标签是否被使用过
  const [naturesUsed, namesUsed, squadNaturesUsed, mapsUsed] = await Promise.all([
    prisma.event.groupBy({ by: ["natureId"], _count: true }),
    prisma.event.groupBy({ by: ["nameId"], _count: true }),
    prisma.squad.groupBy({ by: ["natureId"], _count: true }),
    prisma.event.groupBy({ by: ["mapId"], _count: true }),
  ]);

  const naturesUsedMap = new Map(naturesUsed.map((n) => [n.natureId, n._count]));
  const namesUsedMap = new Map(namesUsed.map((n) => [n.nameId, n._count]));
  const squadNaturesUsedMap = new Map(squadNaturesUsed.map((n) => [n.natureId, n._count]));
  const mapsUsedMap = new Map(
    mapsUsed.filter((n) => n.mapId !== null).map((n) => [n.mapId as string, n._count])
  );

  return ok({
    natures: natures.map((n) => ({ ...n, usedCount: naturesUsedMap.get(n.id) || 0 })),
    names: names.map((n) => ({ ...n, usedCount: namesUsedMap.get(n.id) || 0 })),
    squadNatures: squadNatures.map((n) => ({ ...n, usedCount: squadNaturesUsedMap.get(n.id) || 0 })),
    maps: maps.map((m) => ({ ...m, usedCount: mapsUsedMap.get(m.id) || 0 })),
  });
});
