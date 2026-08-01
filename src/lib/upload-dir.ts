import path from "path";

// 上传目录：默认 <cwd>/uploads（独立于部署产物，更新版本不会丢图）
// 生产环境通过 UPLOAD_DIR 环境变量指向持久目录（如 /opt/squad-signup/uploads）
// 注意：此函数不能定义在 route.ts 中——Next.js 路由文件只允许导出 HTTP 方法
export function getUploadDir(): string {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
}
