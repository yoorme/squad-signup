import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, requireAdmin } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";

// 获取公告列表（队员：返回是否有未读）
export const GET = withErrorHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const url = req.nextUrl;
  const searchParams = url.searchParams;
  const mode = searchParams.get("mode") || "list"; // list | detail
  const id = searchParams.get("id");

  if (mode === "detail") {
    if (!id) return fail("缺少公告 ID");
    const announcement = await prisma.announcement.findUnique({
      where: { id },
      include: {
        author: { select: { username: true, nickname: true } },
        images: { orderBy: { sortOrder: "asc" } },
        reads: { where: { userId: user.id } },
        comments: {
          include: { user: { select: { username: true, nickname: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!announcement) return fail("公告不存在", 404);

    // 自动记录已阅读
    if (announcement.reads.length === 0) {
      await prisma.announcementRead.create({
        data: {
          userId: user.id,
          announcementId: announcement.id,
        },
      }).catch(() => {});
      // 重新查询以包含新创建的阅读记录
      const refetched = await prisma.announcement.findUnique({
        where: { id },
        include: {
          author: { select: { username: true, nickname: true } },
          images: { orderBy: { sortOrder: "asc" } },
          reads: { where: { userId: user.id } },
          comments: {
            include: { user: { select: { username: true, nickname: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      return ok(refetched);
    }

    return ok(announcement);
  }

  if (mode === "stats" && user.role === "ADMIN") {
    // 管理员查看每条公告的阅读统计
    if (!id) return fail("缺少公告 ID");
    const totalUsers = await prisma.user.count({ where: { disabled: false } });
    const announcement = await prisma.announcement.findUnique({
      where: { id },
      include: {
        reads: {
          include: {
            user: { select: { id: true, username: true, nickname: true } },
          },
        },
      },
    });
    if (!announcement) return fail("公告不存在", 404);

    const readCount = announcement.reads.length;
    const confirmedCount = announcement.reads.filter((r) => r.confirmedAt).length;
    const readUserIds = new Set(announcement.reads.map((r) => r.userId));
    const allUsers = await prisma.user.findMany({
      where: { disabled: false },
      select: { id: true, username: true, nickname: true },
    });
    const unreadUsers = allUsers.filter((u) => !readUserIds.has(u.id));

    return ok({
      totalUsers,
      readCount,
      confirmedCount,
      unreadUsers,
      readUsers: announcement.reads.map((r) => ({
        user: r.user,
        readAt: r.readAt,
        confirmedAt: r.confirmedAt,
      })),
    });
  }

  // 默认：列表
  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { username: true, nickname: true } },
      reads: { where: { userId: user.id }, select: { confirmedAt: true } },
      _count: { select: { comments: true } },
    },
  });

  return ok(
    announcements.map((a) => ({
      id: a.id,
      title: a.title,
      author: a.author,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      isRead: a.reads.length > 0,
      isConfirmed: a.reads.some((r) => r.confirmedAt),
      commentCount: a._count.comments,
    }))
  );
});

// 创建公告（管理员）
export const POST = withErrorHandler(async (req: NextRequest) => {
  const user = await requireAdmin();
  const body = await req.json();
  const title = String(body?.title ?? "").trim();
  const contentMarkdown = String(body?.contentMarkdown ?? "");
  const images: string[] = Array.isArray(body?.images) ? body.images : [];

  if (!title) return fail("标题不能为空");
  if (!contentMarkdown) return fail("内容不能为空");

  const announcement = await prisma.announcement.create({
    data: {
      title,
      contentMarkdown,
      authorId: user.id,
      images: {
        create: images.map((path, idx) => ({ path, sortOrder: idx })),
      },
    },
    include: { images: true },
  });

  return ok(announcement);
});

// 修改公告（管理员）
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const body = await req.json();
  const id = String(body?.id ?? "");
  const title = body.title !== undefined ? String(body.title).trim() : undefined;
  const contentMarkdown = body.contentMarkdown !== undefined ? String(body.contentMarkdown) : undefined;
  const images: string[] | undefined = Array.isArray(body?.images) ? body.images : undefined;

  if (!id) return fail("缺少公告 ID");

  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) return fail("公告不存在", 404);

  await prisma.$transaction(async (tx) => {
    if (images !== undefined) {
      await tx.announcementImage.deleteMany({ where: { announcementId: id } });
      if (images.length > 0) {
        await tx.announcementImage.createMany({
          data: images.map((path, idx) => ({ announcementId: id, path, sortOrder: idx })),
        });
      }
    }
    await tx.announcement.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(contentMarkdown !== undefined && { contentMarkdown }),
      },
    });
  });

  return ok({ success: true });
});

// 删除公告（管理员）
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const url = req.nextUrl;
  const id = url.searchParams.get("id");
  if (!id) return fail("缺少公告 ID");

  await prisma.announcement.delete({ where: { id } });
  return ok({ success: true });
});
