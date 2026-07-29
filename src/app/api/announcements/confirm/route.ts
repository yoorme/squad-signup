import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";

// 确认公告
export const POST = withErrorHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await req.json();
  const announcementId = String(body?.announcementId ?? "");
  if (!announcementId) return fail("缺少公告 ID");

  const existing = await prisma.announcementRead.findUnique({
    where: { userId_announcementId: { userId: user.id, announcementId } },
  });

  if (existing) {
    if (!existing.confirmedAt) {
      await prisma.announcementRead.update({
        where: { userId_announcementId: { userId: user.id, announcementId } },
        data: { confirmedAt: new Date() },
      });
    }
  } else {
    await prisma.announcementRead.create({
      data: {
        userId: user.id,
        announcementId,
        confirmedAt: new Date(),
      },
    });
  }

  return ok({ success: true });
});
