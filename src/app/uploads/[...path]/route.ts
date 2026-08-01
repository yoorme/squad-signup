import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getUploadDir } from "@/app/api/upload/route";

// 上传图片的静态服务（standalone 模式下 public/ 是构建时快照，
// 运行时上传的文件必须由动态路由提供，否则重启/更新后 404）
const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const uploadDir = path.resolve(getUploadDir());
  const filePath = path.resolve(uploadDir, ...segments);

  // 防路径穿越：解析后的绝对路径必须仍位于上传目录内
  if (filePath !== uploadDir && !filePath.startsWith(uploadDir + path.sep)) {
    return NextResponse.json({ error: "非法路径" }, { status: 400 });
  }

  const ext = path.extname(filePath).slice(1).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    return NextResponse.json({ error: "不支持的文件类型" }, { status: 400 });
  }

  try {
    const data = await readFile(filePath);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        // 文件名为 UUID 永不复用，可安全长缓存
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
}
