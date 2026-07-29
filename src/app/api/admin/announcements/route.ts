import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-server";
import { ok, withErrorHandler } from "@/lib/api";

// 公告管理列表（含统计）
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const totalUsers = await prisma.user.count({ where: { disabled: false } });
  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { comments: true, reads: true } },
    },
  });
  return ok({
    totalUsers,
    announcements: announcements.map((a) => ({
      id: a.id,
      title: a.title,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      _count: a._count,
    })),
  });
});
