import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";
import { getUploadDir } from "@/lib/upload-dir";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
// 常见图片格式的文件头魔数（防止伪造 Content-Type / 扩展名上传非图片文件）
const MAGIC_SIGNATURES: { ext: string; bytes: number[]; offset?: number }[] = [
  { ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
  { ext: "gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { ext: "bmp", bytes: [0x42, 0x4d] },
  { ext: "webp", bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 }, // RIFF....WEBP
];

function sniffImageExt(buf: Buffer): string | null {
  for (const sig of MAGIC_SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (buf.length < offset + sig.bytes.length) continue;
    const match = sig.bytes.every((b, i) => buf[offset + i] === b);
    if (match) return sig.ext;
  }
  return null;
}

// 删除单个上传文件（仅管理员）
// query: ?path=/uploads/xxx.png 或 ?path=/uploads/tmp/xxx.png
// 安全：仅允许删除 UPLOAD_DIR 内的文件（含 tmp 子目录），防路径穿越
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const url = req.nextUrl;
  const relPath = url.searchParams.get("path");
  if (!relPath) return fail("缺少 path 参数");

  // 仅接受 /uploads/ 前缀
  if (!relPath.startsWith("/uploads/")) {
    return fail("非法路径");
  }
  // 提取 /uploads/ 之后的相对路径（可能含 tmp/ 前缀）
  const relUnderUploads = relPath.slice("/uploads/".length);
  // 拆分 segments，逐个校验：禁止 .. 和空 segment
  const segments = relUnderUploads.split(/[\\/]/);
  for (const seg of segments) {
    if (!seg || seg === "..") return fail("非法路径");
  }
  // 仅允许单层 tmp/ 或直接文件，禁止更深层嵌套
  if (segments.length > 2) return fail("非法路径");
  if (segments.length === 2 && segments[0] !== "tmp") return fail("非法路径");

  const uploadDir = getUploadDir();
  const fullPath = path.resolve(uploadDir, ...segments);
  // 二次校验：解析后路径必须仍在 uploadDir 内
  if (fullPath !== uploadDir && !fullPath.startsWith(uploadDir + path.sep)) {
    return fail("非法路径");
  }

  try {
    await unlink(fullPath);
  } catch (e: any) {
    if (e.code === "ENOENT") return ok({ deleted: false, reason: "文件不存在" });
    throw e;
  }
  return ok({ deleted: true });
});

// 图片上传接口（仅管理员）
// 上传先写到 tmp 子目录，保存公告时由后端迁移到正式目录
// 这样未保存就离开页面不会产生正式目录的孤儿文件
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAdmin();
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return fail("未上传文件");

  // 校验类型
  if (!file.type.startsWith("image/")) {
    return fail("仅支持图片文件");
  }
  // 校验大小（5MB）
  if (file.size > 5 * 1024 * 1024) {
    return fail("图片大小不能超过 5MB");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // 魔数嗅探：以文件真实内容为准，不信任客户端声明的扩展名
  const realExt = sniffImageExt(buffer);
  if (!realExt) {
    return fail("文件内容不是有效的图片格式");
  }

  const fileName = `${randomUUID()}.${realExt}`;
  const uploadDir = getUploadDir();
  // 临时目录：保存公告时才迁移到正式目录
  const tmpDir = path.join(uploadDir, "tmp");
  await mkdir(tmpDir, { recursive: true });
  await writeFile(path.join(tmpDir, fileName), buffer);

  return ok({ path: `/uploads/tmp/${fileName}` });
});
