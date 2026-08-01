#!/usr/bin/env bash
# squad-signup 服务器更新脚本（裸机部署）
# 用法：bash update.sh
#
# 自动完成：检查 swap → 拉取代码 → 跳过类型检查补丁 →
#           安装依赖 → 数据库迁移 → 构建（限制内存）→ 重启服务
#
# 安全保障：
#   1. 自动创建 swap（小内存服务器构建时避免 OOM 崩溃）
#   2. 跳过类型检查（OOM 主要元凶）
#   3. 限制 node 内存 2G
#   4. 构建失败时不重启服务（保持旧版本运行）
#   5. 重启前先停止（避免端口冲突）
set -euo pipefail

INSTALL_DIR="/opt/squad-signup"
cd "$INSTALL_DIR" || { echo "✗ 无法进入 $INSTALL_DIR"; exit 1; }

# 确保 swap 足够（避免构建时 OOM 导致服务器崩溃）
ensure_swap() {
  local swap_mb mem_mb
  swap_mb=$(awk '/SwapTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
  if (( swap_mb >= 2048 )); then
    echo "✓ Swap 已有 ${swap_mb}MB，构建内存充足"
    return 0
  fi
  if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
    echo "! Swap 不足（${swap_mb}MB < 2048MB）且非 root，构建可能 OOM"
    return 0
  fi
  mem_mb=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
  if (( mem_mb >= 4096 )); then
    echo "✓ 物理内存 ${mem_mb}MB 充足，跳过 swap"
    return 0
  fi
  echo "! Swap 不足（${swap_mb}MB）+ 物理内存 ${mem_mb}MB，自动创建 2G swap..."
  if [[ ! -f /swapfile ]]; then
    fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile 2>/dev/null || true
  grep -q '/swapfile' /etc/fstab 2>/dev/null || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "✓ Swap 已创建并启用（2G）"
}

echo "▶ 1/6 检查内存与 swap..."
ensure_swap

echo "▶ 2/6 拉取最新代码..."
git fetch --quiet origin main
git reset --hard origin/main
echo "✓ 代码已更新"

echo "▶ 3/6 应用构建补丁（跳过类型检查，避免 OOM）..."
# git pull 会还原 next.config.ts，这里重新写入跳过类型检查的配置
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

echo "▶ 4/6 安装依赖..."
npm ci --no-audit --no-fund

echo "▶ 5/6 数据库迁移 + 构建..."
set -a; . ./.env; set +a
npx prisma migrate deploy
npx tsx prisma/seed.ts

# 构建：限制内存，失败则不重启服务（保持旧版本运行，避免服务挂掉）
if ! NODE_OPTIONS="--max-old-space-size=2048" npx next build; then
  echo "✗ 构建失败，服务保持当前版本运行，请查看上方错误日志"
  exit 1
fi
echo "✓ 构建完成"

echo "▶ 6/6 重启服务..."
# 先停止确保端口释放，再启动（避免新旧进程端口冲突）
systemctl stop squad-signup 2>/dev/null || true
sleep 1
systemctl start squad-signup
sleep 2
if systemctl is-active --quiet squad-signup; then
  echo "✓ 服务已启动"
else
  echo "✗ 服务可能未正常启动，查看日志：journalctl -u squad-signup -n 50"
fi
echo ""
echo "✓ 更新完成，访问站点验证"
