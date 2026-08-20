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

// 获取公告列表/详情
//
// 归档规则：
// - 普通队员：任何接口都看不到已归档公告（列表默认只返回未归档）
// - 管理员：可通过 status 参数筛选 normal（默认）/ archived / all
export const GET = withErrorHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const url = req.nextUrl;
  const searchParams = url.searchParams;
  const mode = searchParams.get("mode") || "list"; // list | detail
  const id = searchParams.get("id");
  const isAdmin = user.role === "ADMIN";

  if (mode === "detail") {
    if (!id) return fail("缺少公告 ID");
    const announcement = await prisma.announcement.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, username: true, nickname: true } },
        images: { orderBy: { sortOrder: "asc" } },
        comments: {
          include: { user: { select: { id: true, username: true, nickname: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!announcement) return fail("公告不存在", 404);
    // 已归档公告仅管理员可查看
    if (announcement.isArchived && !isAdmin) return fail("公告不存在", 404);

    // 自动记录已阅读（upsert 幂等），仅用于导航红点未读计数
    await prisma.announcementRead
      .upsert({
        where: {
          userId_announcementId: { userId: user.id, announcementId: announcement.id },
        },
        create: { userId: user.id, announcementId: announcement.id },
        update: {},
      })
      .catch(() => {});

    // 标记当前用户是否已读（红点用）
    const myRead = await prisma.announcementRead.findUnique({
      where: {
        userId_announcementId: { userId: user.id, announcementId: announcement.id },
      },
      select: { readAt: true },
    });

    return ok({ ...announcement, isRead: !!myRead });
  }

  // 列表：普通队员强制只看未归档；管理员可筛选
  const statusParam = searchParams.get("status") || "normal"; // normal | archived | all
  const where =
    isAdmin && statusParam === "archived"
      ? { isArchived: true }
      : isAdmin && statusParam === "all"
        ? {}
        : { isArchived: false };

  const announcements = await prisma.announcement.findMany({
    where,
    orderBy: { createdAt: "desc" }, // 时间倒序，新的在前
    include: {
      author: { select: { username: true, nickname: true } },
      reads: { where: { userId: user.id }, select: { readAt: true } },
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
      isArchived: a.isArchived,
      isRead: a.reads.length > 0,
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

// 修改公告（管理员）：标题/内容/归档状态
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const body = await req.json();
  const id = String(body?.id ?? "");
  const title = body.title !== undefined ? String(body.title).trim() : undefined;
  let contentMarkdown = body.contentMarkdown !== undefined ? String(body.contentMarkdown) : undefined;
  let images: string[] | undefined = Array.isArray(body?.images) ? body.images : undefined;
  // 归档/恢复：isArchived true=归档 false=恢复；恢复时清空 archivedAt
  const isArchived = body.isArchived !== undefined ? Boolean(body.isArchived) : undefined;

  if (!id) return fail("缺少公告 ID");

  // 纯归档/恢复操作：直接更新，无需走图片处理
  if (isArchived !== undefined && title === undefined && contentMarkdown === undefined && images === undefined) {
    const existing0 = await prisma.announcement.findUnique({ where: { id }, select: { id: true } });
    if (!existing0) return fail("公告不存在", 404);
    await prisma.announcement.update({
      where: { id },
      data: { isArchived, archivedAt: isArchived ? new Date() : null },
    });
    return ok({ success: true });
  }

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
        ...(isArchived !== undefined && {
          isArchived,
          archivedAt: isArchived ? new Date() : null,
        }),
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
