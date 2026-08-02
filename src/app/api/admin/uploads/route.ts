import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";
import { getUploadDir } from "@/lib/upload-dir";
import { readdir, unlink, stat } from "fs/promises";
import path from "path";

// 从 markdown 文本中提取所有 /uploads/xxx 图片路径
function extractUploadPaths(markdown: string): Set<string> {
  const paths = new Set<string>();
  const re = /!\[[^\]]*\]\((\/uploads\/[^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    paths.add(m[1]);
  }
  return paths;
}

// 安全校验：仅允许删除 UPLOAD_DIR 内的单个文件
function safeResolve(fileName: string): string | null {
  if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) return null;
  const uploadDir = getUploadDir();
  const fullPath = path.join(uploadDir, fileName);
  if (!fullPath.startsWith(uploadDir)) return null;
  return fullPath;
}

// 列出 uploads 目录全部图片文件 + 标记是否被引用
// GET /api/admin/uploads
//   返回 { files: [{ name, path, size, referenced, referencedBy }] }
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();

  const uploadDir = getUploadDir();
  let diskFiles: string[] = [];
  try {
    diskFiles = await readdir(uploadDir);
  } catch (e: any) {
    if (e.code === "ENOENT") {
      return ok({ files: [] });
    }
    throw e;
  }

  // 仅列出图片文件（按扩展名过滤，避免误报 .DS_Store 等）
  const imgExt = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"];
  const imgFiles = diskFiles.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return imgExt.includes(ext);
  });

  // 收集数据库中所有被引用的图片路径
  // 1. AnnouncementImage 表
  const dbImages = await prisma.announcementImage.findMany({ select: { path: true } });
  const dbImageSet = new Set(dbImages.map((i) => i.path));

  // 2. Announcement.contentMarkdown 中引用的图片
  const announcements = await prisma.announcement.findMany({ select: { contentMarkdown: true } });
  const mdImageSet = new Set<string>();
  for (const a of announcements) {
    for (const p of extractUploadPaths(a.contentMarkdown)) {
      mdImageSet.add(p);
    }
  }

  // 组装结果
  const files = [];
  for (const name of imgFiles) {
    const fullPath = path.join(uploadDir, name);
    const relPath = `/uploads/${name}`;
    let size = 0;
    try {
      const s = await stat(fullPath);
      size = s.size;
    } catch {}
    const referenced = dbImageSet.has(relPath) || mdImageSet.has(relPath);
    files.push({ name, path: relPath, size, referenced });
  }

  // 未引用的排前面（便于用户优先清理）
  files.sort((a, b) => {
    if (a.referenced !== b.referenced) return a.referenced ? 1 : -1;
    return b.size - a.size;
  });

  return ok({ files });
});

// 清理孤儿文件（未被任何公告 images 表或 markdown 引用的图片）
// DELETE /api/admin/uploads?mode=orphans  清理未引用的
// DELETE /api/admin/uploads?mode=all      清理全部（危险！仅在确认无公告时使用）
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const url = req.nextUrl;
  const mode = url.searchParams.get("mode") || "orphans"; // orphans | all

  const uploadDir = getUploadDir();
  let diskFiles: string[] = [];
  try {
    diskFiles = await readdir(uploadDir);
  } catch (e: any) {
    if (e.code === "ENOENT") return ok({ deletedCount: 0 });
    throw e;
  }

  const imgExt = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"];
  const imgFiles = diskFiles.filter((f) => imgExt.includes(path.extname(f).toLowerCase()));

  // 确定要保留的集合（mode=all 时为空集，全部删除）
  let keepSet = new Set<string>();
  if (mode === "orphans") {
    const dbImages = await prisma.announcementImage.findMany({ select: { path: true } });
    for (const i of dbImages) keepSet.add(i.path);
    const announcements = await prisma.announcement.findMany({ select: { contentMarkdown: true } });
    for (const a of announcements) {
      for (const p of extractUploadPaths(a.contentMarkdown)) keepSet.add(p);
    }
  }

  let deletedCount = 0;
  let failedCount = 0;
  for (const name of imgFiles) {
    const relPath = `/uploads/${name}`;
    if (keepSet.has(relPath)) continue; // 被引用，跳过
    const fullPath = safeResolve(name);
    if (!fullPath) continue;
    try {
      await unlink(fullPath);
      deletedCount++;
    } catch {
      failedCount++;
    }
  }

  return ok({ deletedCount, failedCount, mode });
});
