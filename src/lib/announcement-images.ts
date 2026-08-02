import { prisma } from "@/lib/prisma";
import { getUploadDir } from "@/lib/upload-dir";
import { rename, copyFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

// 从 markdown 文本中提取所有 /uploads/... 图片引用路径
export function extractUploadPaths(markdown: string): Set<string> {
  const paths = new Set<string>();
  const re = /!\[[^\]]*\]\((\/uploads\/[^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    paths.add(m[1]);
  }
  return paths;
}

// 校验相对路径合法（/uploads/xxx 或 /uploads/tmp/xxx），返回安全绝对路径或 null
function safeResolve(relPath: string): string | null {
  if (!relPath.startsWith("/uploads/")) return null;
  const relUnder = relPath.slice("/uploads/".length);
  const segments = relUnder.split(/[\\/]/);
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

// 安全删除磁盘文件（静默忽略不存在）
async function safeDeleteUpload(relPath: string): Promise<void> {
  const fullPath = safeResolve(relPath);
  if (!fullPath) return;
  try {
    await unlink(fullPath);
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
}

/**
 * 处理保存公告时的图片：
 * 1. tmp 路径 → 迁移到正式目录，返回路径映射 {oldPath: newPath}
 * 2. 正式路径 → 检查跨公告引用，被其他公告引用则复制新文件，返回路径映射
 *
 * 调用方需用返回的映射替换 markdown 和 images 中的路径。
 *
 * @param currentAnnouncementId 当前公告 ID（新建时为 null）；用于排除自身查询跨公告引用
 */
export async function processImagesOnSave(
  paths: Set<string>,
  currentAnnouncementId: string | null
): Promise<Map<string, string>> {
  const uploadDir = path.resolve(getUploadDir());
  await mkdir(uploadDir, { recursive: true });
  const mapping = new Map<string, string>(); // oldPath -> newPath

  // 收集所有需要检查跨公告引用的"正式路径"
  const formalPaths = Array.from(paths).filter(
    (p) => p.startsWith("/uploads/") && !p.startsWith("/uploads/tmp/")
  );

  // 一次性查出所有其他公告引用的图片路径
  const otherReferencedPaths = new Set<string>();
  if (formalPaths.length > 0) {
    // AnnouncementImage 表（排除当前公告）
    const where = currentAnnouncementId
      ? { announcementId: { not: currentAnnouncementId } }
      : {};
    const otherImages = await prisma.announcementImage.findMany({
      where,
      select: { path: true },
    });
    for (const i of otherImages) otherReferencedPaths.add(i.path);

    // Announcement.contentMarkdown 中引用的（排除当前公告）
    const otherAnns = currentAnnouncementId
      ? await prisma.announcement.findMany({
          where: { id: { not: currentAnnouncementId } },
          select: { contentMarkdown: true },
        })
      : await prisma.announcement.findMany({ select: { contentMarkdown: true } });
    for (const a of otherAnns) {
      for (const p of extractUploadPaths(a.contentMarkdown)) {
        otherReferencedPaths.add(p);
      }
    }
  }

  for (const oldPath of paths) {
    if (mapping.has(oldPath)) continue; // 已处理（去重）

    // tmp 路径：迁移到正式目录
    if (oldPath.startsWith("/uploads/tmp/")) {
      const fileName = oldPath.slice("/uploads/tmp/".length);
      if (!fileName || fileName.includes("/") || fileName.includes("\\")) {
        continue; // 非法，跳过
      }
      const srcPath = path.join(uploadDir, "tmp", fileName);
      const dstPath = path.join(uploadDir, fileName);
      try {
        await rename(srcPath, dstPath);
        const newPath = `/uploads/${fileName}`;
        mapping.set(oldPath, newPath);
      } catch (e: any) {
        if (e.code === "ENOENT") {
          // tmp 文件不存在（可能已被清理），跳过
          continue;
        }
        throw e;
      }
      continue;
    }

    // 正式路径：检查跨公告引用，被其他公告引用则复制一份新文件
    if (otherReferencedPaths.has(oldPath)) {
      const fileName = oldPath.slice("/uploads/".length);
      if (!fileName || fileName.includes("/") || fileName.includes("\\")) {
        continue;
      }
      const srcPath = path.join(uploadDir, fileName);
      // 生成新文件名（保留扩展名）
      const ext = path.extname(fileName);
      const newFileName = `${randomUUID()}${ext}`;
      const dstPath = path.join(uploadDir, newFileName);
      try {
        await copyFile(srcPath, dstPath);
        const newPath = `/uploads/${newFileName}`;
        mapping.set(oldPath, newPath);
      } catch (e: any) {
        if (e.code === "ENOENT") continue; // 源文件不存在，跳过
        throw e;
      }
      continue;
    }

    // 正式路径且未被其他公告引用：保持不变
    // mapping 中不记录（无需替换）
  }

  return mapping;
}

// 用路径映射替换 markdown 中的图片引用
export function applyPathMapping(markdown: string, mapping: Map<string, string>): string {
  if (mapping.size === 0) return markdown;
  let result = markdown;
  for (const [oldPath, newPath] of mapping) {
    if (oldPath === newPath) continue;
    // 转义正则特殊字符
    const escaped = oldPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\(${escaped}\\)`, "g");
    result = result.replace(re, `(${newPath})`);
  }
  return result;
}

/**
 * 删除被移除的图片（仅在当前公告中且不在新 images/markdown 中的旧图）
 * 跨公告安全：被其他公告引用的不删
 */
export async function deleteRemovedImages(
  oldPaths: string[],
  newPaths: Set<string>,
  currentAnnouncementId: string
): Promise<void> {
  // 收集其他公告引用的路径
  const otherReferencedPaths = new Set<string>();
  const otherImages = await prisma.announcementImage.findMany({
    where: { announcementId: { not: currentAnnouncementId } },
    select: { path: true },
  });
  for (const i of otherImages) otherReferencedPaths.add(i.path);
  const otherAnns = await prisma.announcement.findMany({
    where: { id: { not: currentAnnouncementId } },
    select: { contentMarkdown: true },
  });
  for (const a of otherAnns) {
    for (const p of extractUploadPaths(a.contentMarkdown)) {
      otherReferencedPaths.add(p);
    }
  }

  const toDelete = Array.from(new Set(oldPaths.filter((p) => !newPaths.has(p) && !otherReferencedPaths.has(p))));
  for (const p of toDelete) {
    await safeDeleteUpload(p).catch(() => {});
  }
}
