import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth-server";
import { ok, fail, withErrorHandler } from "@/lib/api";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

// 图片上传接口（仅管理员）
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

  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const allowedExts = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
  if (!allowedExts.includes(ext)) {
    return fail("不支持的图片格式");
  }

  const fileName = `${randomUUID()}.${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, fileName);

  const arrayBuffer = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(arrayBuffer));

  return ok({ path: `/uploads/${fileName}` });
});
