import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";
import { getSiteSettings, LEGACY_DEFAULT_PREFIX } from "@/lib/site-settings";
import { getUploadDir } from "@/lib/upload-dir";
import { writeFile, mkdir, unlink, stat } from "fs/promises";
import path from "path";

// ============ 战队管理 ============
// GET    获取当前设置
// PATCH  修改战队名称前缀（存量用户名自动迁移：前缀+昵称）
// POST   上传自定义战队图标（仅 32×32 的 .ico）
// DELETE 恢复默认图标

// 图标固定文件名（存于 UPLOAD_DIR 根目录，独立于 standalone 产物，更新版本不丢失）
const TEAM_ICON_FILE = "team-icon.ico";
const MAX_ICON_SIZE = 512 * 1024; // 512KB（32×32 ICO 通常 < 10KB）

// 校验 ICO 二进制：文件头魔数 + 所有图像条目均为 32×32
// 返回 null 表示合法，否则返回错误信息
function validateIco32(buf: Buffer): string | null {
  if (buf.length < 6) return "文件过小，不是有效的 ICO 文件";
  // ICO 头：reserved(2B)=0 + type(2B)=1 + count(2B)
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) {
    return "不是有效的 ICO 文件（魔数校验失败）";
  }
  const count = buf.readUInt16LE(4);
  if (count === 0 || count > 64) return "ICO 文件图像数量异常";
  if (buf.length < 6 + count * 16) return "ICO 文件不完整";
  for (let i = 0; i < count; i++) {
    const w = buf[6 + i * 16]; // 宽度（字节值 0 表示 256）
    const h = buf[6 + i * 16 + 1]; // 高度
    if (w !== 32 || h !== 32) {
      return `图标必须为 32×32（检测到 ${w === 0 ? 256 : w}×${h === 0 ? 256 : h} 的图像，多尺寸 ICO 不支持）`;
    }
  }
  return null;
}

// GET /api/admin/team
export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const settings = await getSiteSettings();

  let hasCustomIcon = false;
  if (settings.iconName) {
    try {
      await stat(path.join(path.resolve(getUploadDir()), settings.iconName));
      hasCustomIcon = true;
    } catch {
      hasCustomIcon = false; // 文件不存在（未上传或被清理）
    }
  }

  return ok({
    teamPrefix: settings.teamPrefix,
    iconName: settings.iconName,
    hasCustomIcon,
    // 图标版本号：前端拼接在 /favicon.ico?v= 后用于刷新预览缓存
    iconVersion: settings.iconUpdatedAt?.getTime() ?? 0,
  });
});

// PATCH /api/admin/team
// body: { teamPrefix: string }
// 前缀变更时在同一事务内将所有用户名迁移为「新前缀+昵称」，
// 采用两阶段更新（先临时名再最终名）规避唯一约束的行间冲突
export const PATCH = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const body = await req.json();
  const newPrefix = String(body?.teamPrefix ?? "").trim();

  if (newPrefix.length > 12) return fail("前缀长度不能超过 12 个字符");
  if (/\s/.test(newPrefix)) return fail("前缀不能包含空白字符");

  const current = await getSiteSettings();

  if (newPrefix === current.teamPrefix) {
    // 值未变化，仅确保设置行存在（存量部署首次保存时落库）
    await prisma.siteSetting.upsert({
      where: { id: "global" },
      create: { id: "global", teamPrefix: newPrefix },
      update: {},
    });
    return ok({ success: true, migrated: 0 });
  }

  // 事务：迁移用户名 + 更新设置
  const migrated = await prisma.$transaction(async (tx) => {
    const users = await tx.user.findMany({ select: { nickname: true } });

    // 终态用户名唯一性预检（昵称可能重复的历史脏数据会导致冲突，先拒绝）
    const finalNames = users.map((u) => newPrefix + u.nickname);
    if (new Set(finalNames).size !== finalNames.length) {
      throw new Error("存在昵称重复的用户，迁移后将产生冲突的用户名，请先在用户管理中处理");
    }

    // 阶段一：全部改为「临时唯一名」（id 保证唯一，不触碰唯一约束）
    await tx.$executeRaw`UPDATE "User" SET username = 'migrating::' || "id"`;
    // 阶段二：写入最终用户名（已预检唯一，逐行检查不会撞唯一索引）
    await tx.$executeRaw`UPDATE "User" SET username = ${newPrefix} || "nickname"`;

    await tx.siteSetting.upsert({
      where: { id: "global" },
      create: { id: "global", teamPrefix: newPrefix },
      update: { teamPrefix: newPrefix },
    });
    return users.length;
  });

  return ok({ success: true, migrated });
});

// POST /api/admin/team —— 上传自定义图标（multipart/form-data: file）
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return fail("未上传文件");

  if (file.size > MAX_ICON_SIZE) return fail("图标文件不能超过 512KB");

  const buffer = Buffer.from(await file.arrayBuffer());
  const icoError = validateIco32(buffer);
  if (icoError) return fail(icoError);

  // 写入固定文件名（覆盖旧图标），目录独立于部署产物
  const uploadDir = path.resolve(getUploadDir());
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, TEAM_ICON_FILE), buffer);

  const now = new Date();
  await prisma.siteSetting.upsert({
    where: { id: "global" },
    // 首次落库（存量部署）：前缀保持当前生效值（无行时为旧版默认），
    // 仅设置图标，避免把已生效的前缀意外重置为空
    create: {
      id: "global",
      teamPrefix: LEGACY_DEFAULT_PREFIX,
      iconName: TEAM_ICON_FILE,
      iconUpdatedAt: now,
    },
    update: { iconName: TEAM_ICON_FILE, iconUpdatedAt: now },
  });

  return ok({ success: true, iconVersion: now.getTime() });
});

// DELETE /api/admin/team —— 恢复默认图标
export const DELETE = withErrorHandler(async () => {
  await requireAdmin();
  await prisma.siteSetting.updateMany({
    where: { id: "global" },
    data: { iconName: null, iconUpdatedAt: null },
  });
  // 删除物理文件（不存在时忽略）
  try {
    await unlink(path.join(path.resolve(getUploadDir()), TEAM_ICON_FILE));
  } catch (e: any) {
    if (e?.code !== "ENOENT") throw e;
  }
  return ok({ success: true });
});
