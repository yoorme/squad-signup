import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";
import { getUploadDir } from "@/lib/upload-dir";
import { readdir, unlink, stat } from "fs/promises";
import path from "path";
import { extractUploadPaths } from "@/lib/announcement-images";

// 安全校验：仅允许删除 UPLOAD_DIR 内的单个文件（含 tmp 子目录）
function safeResolve(relUnderUploads: string): string | null {
  const segments = relUnderUploads.split(/[\\/]/);
  for (const seg of segments) {
    if (!seg || seg === "..") return null;
  }
  if (segments.length > 2) return null;
  if (segments.length === 2 && segments[0] !== "tmp") return null;
  const uploadDir = path.resolve(getUploadDir());
  const fullPath = path.resolve(uploadDir, ...segments);
  if (fullPath !== uploadDir && !fullPath.startsWith(uploadDir + path.sep)) return null;
  return fullPath;
}

// 列出 uploads 目录全部图片文件（含 tmp 子目录）+ 标记是否被引用
// GET /api/admin/uploads
export const GET = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();

  const uploadDir = path.resolve(getUploadDir());
  const files: { name: string; path: string; size: number; referenced: boolean; tmp: boolean }[] = [];

  // 读取正式目录
  let topFiles: string[] = [];
  try {
    topFiles = await readdir(uploadDir);
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }

  // 读取 tmp 子目录
  let tmpFiles: string[] = [];
  try {
    tmpFiles = await readdir(path.join(uploadDir, "tmp"));
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }

  // 收集数据库中所有被引用的图片路径
  const dbImages = await prisma.announcementImage.findMany({ select: { path: true } });
  const dbImageSet = new Set(dbImages.map((i) => i.path));
  const announcements = await prisma.announcement.findMany({ select: { contentMarkdown: true } });
  const mdImageSet = new Set<string>();
  for (const a of announcements) {
    for (const p of extractUploadPaths(a.contentMarkdown)) mdImageSet.add(p);
  }

  const imgExt = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"];

  // 正式目录文件
  for (const name of topFiles) {
    if (!imgExt.includes(path.extname(name).toLowerCase())) continue;
    const relPath = `/uploads/${name}`;
    let size = 0;
    try { size = (await stat(path.join(uploadDir, name))).size; } catch {}
    files.push({
      name,
      path: relPath,
      size,
      referenced: dbImageSet.has(relPath) || mdImageSet.has(relPath),
      tmp: false,
    });
  }

  // tmp 目录文件（都是未保存的临时文件，一律视为未引用）
  for (const name of tmpFiles) {
    if (!imgExt.includes(path.extname(name).toLowerCase())) continue;
    const relPath = `/uploads/tmp/${name}`;
    let size = 0;
    try { size = (await stat(path.join(uploadDir, "tmp", name))).size; } catch {}
    files.push({ name, path: relPath, size, referenced: false, tmp: true });
  }

  // 排序：tmp 残留最前，其次未引用，最后已引用；同组按大小倒序
  files.sort((a, b) => {
    if (a.tmp !== b.tmp) return a.tmp ? -1 : 1;
    if (a.referenced !== b.referenced) return a.referenced ? 1 : -1;
    return b.size - a.size;
  });

  return ok({ files });
});

// 清理文件
// DELETE /api/admin/uploads?mode=orphans  清理未引用的（含 tmp 残留）
// DELETE /api/admin/uploads?mode=all      清理全部正式图片（高危，不动 tmp）
// DELETE /api/admin/uploads?mode=tmp      仅清理 tmp 残留
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const url = req.nextUrl;
  const mode = url.searchParams.get("mode") || "orphans";
  if (mode !== "orphans" && mode !== "all" && mode !== "tmp") {
    return fail("非法 mode 参数（仅支持 orphans / all / tmp）");
  }

  const uploadDir = path.resolve(getUploadDir());

  // 收集数据库引用（mode=orphans 时用于判断保留）
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
  const imgExt = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"];

  // 处理 tmp 目录（mode=orphans / mode=tmp 都清理 tmp）
  if (mode === "orphans" || mode === "tmp") {
    let tmpFiles: string[] = [];
    try {
      tmpFiles = await readdir(path.join(uploadDir, "tmp"));
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
    for (const name of tmpFiles) {
      if (!imgExt.includes(path.extname(name).toLowerCase())) continue;
      const fullPath = safeResolve(`tmp/${name}`);
      if (!fullPath) continue;
      try { await unlink(fullPath); deletedCount++; } catch { failedCount++; }
    }
  }

  // 处理正式目录（mode=orphans / mode=all）
  if (mode === "orphans" || mode === "all") {
    let topFiles: string[] = [];
    try {
      topFiles = await readdir(uploadDir);
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
    for (const name of topFiles) {
      if (!imgExt.includes(path.extname(name).toLowerCase())) continue;
      const relPath = `/uploads/${name}`;
      if (mode === "orphans" && keepSet.has(relPath)) continue;
      const fullPath = safeResolve(name);
      if (!fullPath) continue;
      try { await unlink(fullPath); deletedCount++; } catch { failedCount++; }
    }
  }

  return ok({ deletedCount, failedCount, mode });
});
