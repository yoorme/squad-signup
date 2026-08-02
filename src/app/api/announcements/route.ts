import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, requireAdmin } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";
import {
  extractUploadPaths,
  processImagesOnSave,
  applyPathMapping,
  removePathsFromMarkdown,
  deleteRemovedImages,
} from "@/lib/announcement-images";

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
        author: { select: { id: true, username: true, nickname: true } },
        images: { orderBy: { sortOrder: "asc" } },
        reads: { where: { userId: user.id } },
        comments: {
          include: { user: { select: { id: true, username: true, nickname: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!announcement) return fail("公告不存在", 404);

    // 自动记录已阅读（upsert 幂等，避免重复创建；不再二次查询）
    if (announcement.reads.length === 0) {
      await prisma.announcementRead.upsert({
        where: {
          userId_announcementId: { userId: user.id, announcementId: announcement.id },
        },
        create: { userId: user.id, announcementId: announcement.id },
        update: {},
      }).catch(() => {});
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
  let contentMarkdown = String(body?.contentMarkdown ?? "");
  let images: string[] = Array.isArray(body?.images) ? body.images : [];

  if (!title) return fail("标题不能为空");
  if (!contentMarkdown) return fail("内容不能为空");

  // 处理图片：tmp→正式目录迁移 + 跨公告隔离
  // 收集所有引用路径（markdown + images 数组）
  const allPaths = new Set<string>([...images, ...extractUploadPaths(contentMarkdown)]);
  const { mapping, missingPaths } = await processImagesOnSave(allPaths, null);
  if (mapping.size > 0) {
    contentMarkdown = applyPathMapping(contentMarkdown, mapping);
    images = images.map((p) => mapping.get(p) ?? p);
  }
  // 移除缺失文件的引用（tmp 文件已被清理等场景），避免写入无效路径
  if (missingPaths.size > 0) {
    contentMarkdown = removePathsFromMarkdown(contentMarkdown, missingPaths);
    images = images.filter((p) => !missingPaths.has(p));
  }

  const announcement = await prisma.announcement.create({
    data: {
      title,
      contentMarkdown,
      authorId: user.id,
      images: {
        create: images.map((p, idx) => ({ path: p, sortOrder: idx })),
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
  let contentMarkdown = body.contentMarkdown !== undefined ? String(body.contentMarkdown) : undefined;
  let images: string[] | undefined = Array.isArray(body?.images) ? body.images : undefined;

  if (!id) return fail("缺少公告 ID");

  const existing = await prisma.announcement.findUnique({
    where: { id },
    include: { images: true },
  });
  if (!existing) return fail("公告不存在", 404);

  // 收集旧图片路径（images 表 + markdown 引用）
  const oldImagePaths = existing.images.map((img) => img.path);
  const oldMdPaths = Array.from(extractUploadPaths(existing.contentMarkdown));
  const oldPaths = [...oldImagePaths, ...oldMdPaths];

  // 处理图片：tmp→正式迁移 + 跨公告隔离（排除当前公告）
  if (contentMarkdown !== undefined || images !== undefined) {
    const newImages = images ?? oldImagePaths;
    const newMd = contentMarkdown ?? existing.contentMarkdown;
    const allPaths = new Set<string>([...newImages, ...extractUploadPaths(newMd)]);
    const { mapping, missingPaths } = await processImagesOnSave(allPaths, id);
    if (mapping.size > 0) {
      if (contentMarkdown !== undefined) {
        contentMarkdown = applyPathMapping(contentMarkdown, mapping);
      }
      if (images !== undefined) {
        images = images.map((p) => mapping.get(p) ?? p);
      }
    }
    // 移除缺失文件的引用（tmp 文件已被清理等场景）
    if (missingPaths.size > 0) {
      if (contentMarkdown !== undefined) {
        contentMarkdown = removePathsFromMarkdown(contentMarkdown, missingPaths);
      } else {
        // 未传 contentMarkdown 但有缺失图：基于现有 markdown 移除后赋值
        contentMarkdown = removePathsFromMarkdown(existing.contentMarkdown, missingPaths);
      }
      if (images !== undefined) {
        images = images.filter((p) => !missingPaths.has(p));
      } else {
        // 未传 images 但有缺失图：基于旧 images 移除后赋值
        images = oldImagePaths.filter((p) => !missingPaths.has(p));
      }
    }
  }

  // 计算最终新路径集合（用于对比删盘）
  const finalImages = images ?? oldImagePaths;
  const finalMd = contentMarkdown ?? existing.contentMarkdown;
  const newPaths = new Set<string>([...finalImages, ...extractUploadPaths(finalMd)]);

  await prisma.$transaction(async (tx) => {
    if (images !== undefined) {
      await tx.announcementImage.deleteMany({ where: { announcementId: id } });
      if (images.length > 0) {
        await tx.announcementImage.createMany({
          data: images.map((p, idx) => ({ announcementId: id, path: p, sortOrder: idx })),
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

  // 删除被移除的旧图（跨公告安全：被其他公告引用的不删）
  await deleteRemovedImages(oldPaths, newPaths, id).catch(() => {});

  return ok({ success: true });
});

// 删除公告（管理员）
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const url = req.nextUrl;
  const id = url.searchParams.get("id");
  if (!id) return fail("缺少公告 ID");

  // 先查出关联图片路径（含 images 表 + markdown 正文引用），删库后用于删盘
  const announcement = await prisma.announcement.findUnique({
    where: { id },
    include: { images: true },
  });
  if (!announcement) return fail("公告不存在", 404);

  const oldPaths = [
    ...announcement.images.map((img) => img.path),
    ...Array.from(extractUploadPaths(announcement.contentMarkdown)),
  ];

  // 删除数据库记录（级联删除 images/reads/comments）
  await prisma.announcement.delete({ where: { id } });

  // 删盘：该公告的所有图都不再属于它（已删库），newPaths 为空
  // deleteRemovedImages 会跨公告安全检查：被其他公告引用的不删
  await deleteRemovedImages(oldPaths, new Set(), id).catch(() => {});

  return ok({ success: true });
});
