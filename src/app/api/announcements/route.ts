import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, requireAdmin } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";
import { getUploadDir } from "@/lib/upload-dir";
import { unlink } from "fs/promises";
import path from "path";

// 从 markdown 文本中提取所有 /uploads/xxx 图片引用路径
function extractUploadPaths(markdown: string): string[] {
  const paths: string[] = [];
  // 匹配 ![alt](/uploads/xxx.png) 形式
  const re = /!\[[^\]]*\]\((\/uploads\/[^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    paths.push(m[1]);
  }
  return paths;
}

// 安全删除磁盘文件（路径穿越校验 + 静默忽略不存在）
async function safeDeleteUpload(relPath: string): Promise<void> {
  if (!relPath.startsWith("/uploads/")) return;
  const fileName = relPath.slice("/uploads/".length);
  if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) return;
  const uploadDir = getUploadDir();
  const fullPath = path.join(uploadDir, fileName);
  if (!fullPath.startsWith(uploadDir)) return;
  try {
    await unlink(fullPath);
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
}

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
  const contentMarkdown = String(body?.contentMarkdown ?? "");
  // images 仅用于编辑器缩略图展示，不再二次渲染到详情页（详情页只渲染 markdown）
  // 仍保留以支持缩略图列表、复制 Markdown、按图删除等编辑器功能
  const images: string[] = Array.isArray(body?.images) ? body.images : [];

  if (!title) return fail("标题不能为空");
  if (!contentMarkdown) return fail("内容不能为空");

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
  const contentMarkdown = body.contentMarkdown !== undefined ? String(body.contentMarkdown) : undefined;
  const images: string[] | undefined = Array.isArray(body?.images) ? body.images : undefined;

  if (!id) return fail("缺少公告 ID");

  const existing = await prisma.announcement.findUnique({
    where: { id },
    include: { images: true },
  });
  if (!existing) return fail("公告不存在", 404);

  // 计算被移除的图片（旧 images - 新 images），需删盘
  const removedPaths: string[] = [];
  if (images !== undefined) {
    const newSet = new Set(images);
    for (const img of existing.images) {
      if (!newSet.has(img.path)) removedPaths.push(img.path);
    }
  }

  // 计算新 markdown 中不再引用的图片（旧正文图片 - 新正文图片），需删盘
  if (contentMarkdown !== undefined) {
    const oldMdPaths = new Set(extractUploadPaths(existing.contentMarkdown));
    const newMdPaths = new Set(extractUploadPaths(contentMarkdown));
    for (const p of oldMdPaths) {
      if (!newMdPaths.has(p)) removedPaths.push(p);
    }
  }

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

  // 数据库提交成功后再删盘（避免删盘成功但事务回滚导致图丢库还在）
  // 去重后逐个删（一张图可能既在 images 又在 markdown）
  const toDelete = Array.from(new Set(removedPaths));
  for (const p of toDelete) {
    await safeDeleteUpload(p).catch(() => {}); // 删盘失败不阻塞保存
  }

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

  const pathsToDelete: string[] = [
    ...announcement.images.map((img) => img.path),
    ...extractUploadPaths(announcement.contentMarkdown),
  ];

  // 删除数据库记录（级联删除 images/reads/comments）
  await prisma.announcement.delete({ where: { id } });

  // 删盘（去重后逐个删，失败不阻塞）
  const toDelete = Array.from(new Set(pathsToDelete));
  for (const p of toDelete) {
    await safeDeleteUpload(p).catch(() => {});
  }

  return ok({ success: true, deletedFiles: toDelete.length });
});
