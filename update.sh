#!/usr/bin/env bash
# squad-signup 服务器更新脚本（裸机部署）
# 用法：bash update.sh
#
# 自动完成：拉取最新代码 → 应用构建补丁（跳过类型检查避免 OOM）→
#           安装依赖 → 数据库迁移 → 构建 → 重启服务
set -euo pipefail

INSTALL_DIR="/opt/squad-signup"
cd "$INSTALL_DIR" || { echo "✗ 无法进入 $INSTALL_DIR"; exit 1; }

echo "▶ 1/5 拉取最新代码..."
git fetch --quiet origin main
git reset --hard origin/main
echo "✓ 代码已更新"

echo "▶ 2/5 应用构建补丁（跳过类型检查，避免小内存 OOM）..."
# git pull 会还原 next.config.ts，这里重新打补丁
cat > next.config.ts <<'PATCH'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["remote-agent.svc.cluster.local", "*.remote-agent.svc.cluster.local"],
  poweredByHeader: false,
  compress: true,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
PATCH
echo "✓ 补丁已应用"

echo "▶ 3/5 安装依赖..."
npm ci --no-audit --no-fund

echo "▶ 4/5 数据库迁移 + 构建..."
set -a; . ./.env; set +a
npx prisma migrate deploy
npx tsx prisma/seed.ts
NODE_OPTIONS="--max-old-space-size=2048" npx next build
echo "✓ 构建完成"

echo "▶ 5/5 重启服务..."
systemctl restart squad-signup
sleep 2
systemctl status squad-signup --no-pager | head -5
echo ""
echo "✓ 更新完成，访问站点验证"
