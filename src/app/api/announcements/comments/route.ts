import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";

// 获取某公告的留言
export const GET = withErrorHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const announcementId = req.nextUrl.searchParams.get("announcementId");
  if (!announcementId) return fail("缺少公告 ID");

  const comments = await prisma.announcementComment.findMany({
    where: { announcementId },
    include: { user: { select: { id: true, username: true, nickname: true } } },
    orderBy: { createdAt: "asc" },
  });
  return ok(comments.map((c) => ({
    id: c.id,
    content: c.content,
    createdAt: c.createdAt,
    user: c.user,
    isMine: c.user.id === user.id,
  })));
});

// 发布留言
export const POST = withErrorHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = await req.json();
  const announcementId = String(body?.announcementId ?? "");
  const content = String(body?.content ?? "").trim();
  if (!announcementId) return fail("缺少公告 ID");
  if (!content) return fail("留言不能为空");
  if (content.length > 500) return fail("留言不能超过 500 字");

  const comment = await prisma.announcementComment.create({
    data: { announcementId, userId: user.id, content },
    include: { user: { select: { username: true, nickname: true } } },
  });

  return ok({
    id: comment.id,
    content: comment.content,
    createdAt: comment.createdAt,
    user: comment.user,
    isMine: true,
  });
});

// 删除留言（仅作者或管理员）
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return fail("缺少留言 ID");

  const comment = await prisma.announcementComment.findUnique({ where: { id } });
  if (!comment) return fail("留言不存在", 404);

  if (comment.userId !== user.id && user.role !== "ADMIN") {
    return fail("无权删除他人留言", 403);
  }

  await prisma.announcementComment.delete({ where: { id } });
  return ok({ success: true });
});
