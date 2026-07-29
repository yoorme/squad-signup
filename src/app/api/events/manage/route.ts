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

// 归档/恢复赛事状态（管理员）
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const body = await req.json();
  const id = String(body?.id ?? "");
  const status = body?.status as "UPCOMING" | "ARCHIVED" | undefined;

  if (!id) return fail("缺少赛事 ID");
  if (status && !["UPCOMING", "ARCHIVED"].includes(status)) {
    return fail("无效状态");
  }

  await prisma.event.update({
    where: { id },
    data: status ? { status } : {},
  });

  return ok({ success: true });
});
