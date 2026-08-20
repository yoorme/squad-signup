import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-server";
import { ok, withErrorHandler } from "@/lib/api";

// 公告管理列表
// status: normal（默认）| archived | all，配合前端 tab 切换
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const status = req.nextUrl.searchParams.get("status") || "normal"; // normal | archived | all

  const where =
    status === "archived"
      ? { isArchived: true }
      : status === "all"
        ? {}
        : { isArchived: false };

  const announcements = await prisma.announcement.findMany({
    where,
    orderBy: { createdAt: "desc" }, // 时间倒序，新的在前
    include: {
      _count: { select: { comments: true } },
    },
  });
  return ok({
    announcements: announcements.map((a) => ({
      id: a.id,
      title: a.title,
      isArchived: a.isArchived,
      archivedAt: a.archivedAt,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      commentCount: a._count.comments,
    })),
  });
});
