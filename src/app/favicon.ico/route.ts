import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getSiteSettings } from "@/lib/site-settings";
import { getDefaultFavicon } from "@/lib/default-icon";
import { getUploadDir } from "@/lib/upload-dir";

// 动态战队图标（浏览器标签页图标）
// 优先级：管理后台上传的自定义 32×32 图标（存于 UPLOAD_DIR）> 内嵌默认图标
// 注意：必须 force-dynamic，否则 GET 路由会在构建期被静态化、固化成默认图标
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const settings = await getSiteSettings();

  if (settings.iconName) {
    // 防路径穿越：图标文件名由后端生成，但仍校验不含路径分隔符
    if (!/[\\/]/.test(settings.iconName)) {
      const filePath = path.join(path.resolve(getUploadDir()), settings.iconName);
      try {
        const data = await readFile(filePath);
        // 以图标更新时间作 ETag：更新图标后浏览器能立即感知（304 语义）
        const etag = `"team-icon-${settings.iconUpdatedAt?.getTime() ?? "v1"}"`;
        if (req.headers.get("if-none-match") === etag) {
          return new NextResponse(null, { status: 304, headers: { ETag: etag } });
        }
        return new NextResponse(new Uint8Array(data), {
          headers: {
            "Content-Type": "image/x-icon",
            "Cache-Control": "no-cache", // 图标可被管理员随时更换，不做长缓存
            ETag: etag,
            "X-Content-Type-Options": "nosniff",
          },
        });
      } catch {
        // 自定义图标文件丢失（如磁盘被清理）→ 降级为默认图标
      }
    }
  }

  return new NextResponse(new Uint8Array(getDefaultFavicon()), {
    headers: {
      "Content-Type": "image/x-icon",
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
