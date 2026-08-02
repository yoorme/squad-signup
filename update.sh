#!/usr/bin/env bash
# squad-signup 服务器更新脚本（预构建产物模式）
# 用法：bash update.sh
#
# 核心思路：不在服务器上构建！直接下载 GitHub Actions 预构建的产物。
# 服务器只做：停服务 → 下载产物 → 跑迁移 → 启动。
# 全程内存占用 < 200MB，绝不会 OOM 崩溃。
set -euo pipefail

INSTALL_DIR="/opt/squad-signup"
REPO="yoorme/squad-signup"
DIST_URL="https://github.com/${REPO}/releases/download/latest/dist.tar.gz"

cd "$INSTALL_DIR" || { echo "✗ 无法进入 $INSTALL_DIR（请先用 install.sh 安装）"; exit 1; }

echo "▶ 1/4 停止服务..."
systemctl stop squad-signup 2>/dev/null || true
echo "✓ 服务已停止"

echo "▶ 2/4 下载预构建产物..."
tmp_tar="/tmp/squad-signup-dist.tar.gz"
if ! curl -fsSL "$DIST_URL" -o "$tmp_tar"; then
  echo "✗ 下载失败。GitHub Actions 可能还在构建中"
  echo "  查看构建状态：https://github.com/${REPO}/actions"
  echo "  服务已停止，原版本文件仍在，可手动启动恢复：systemctl start squad-signup"
  exit 1
fi
echo "✓ 产物下载完成（$(du -h "$tmp_tar" | cut -f1)）"

# 解压（保留 .env 和 .deploy.conf）
tmp_extract=$(mktemp -d)
tar -xzf "$tmp_tar" -C "$tmp_extract"
rm -f "$tmp_tar"

# 备份 .env
env_backup=""
if [[ -f "$INSTALL_DIR/.env" ]]; then
  env_backup=$(mktemp)
  cp "$INSTALL_DIR/.env" "$env_backup"
fi

# 替换 standalone 和 prisma
rm -rf "$INSTALL_DIR/standalone" "$INSTALL_DIR/prisma"
mv "$tmp_extract/standalone" "$INSTALL_DIR/standalone"
mv "$tmp_extract/prisma" "$INSTALL_DIR/prisma"
rm -rf "$tmp_extract"

# 恢复 .env
if [[ -n "$env_backup" ]]; then
  cp "$env_backup" "$INSTALL_DIR/.env"
  rm -f "$env_backup"
fi

# 上传文件持久目录（独立于 standalone 产物，版本更新不丢图）
mkdir -p "$INSTALL_DIR/uploads"
# 老版本 .env 可能缺少 UPLOAD_DIR，自动补齐
if ! grep -q '^UPLOAD_DIR=' "$INSTALL_DIR/.env" 2>/dev/null; then
  echo "UPLOAD_DIR='$INSTALL_DIR/uploads'" >> "$INSTALL_DIR/.env"
  echo "✓ 已向 .env 补充 UPLOAD_DIR 配置"
fi
echo "✓ 产物已更新"

echo "▶ 3/4 数据库迁移..."
# 装 prisma@6 + @prisma/client@6 + tsx@4 + bcryptjs@3（seed.ts 需要）
# 必须锁版本 + 装齐 seed.ts 的所有依赖
npm install --no-audit --no-fund --no-save prisma@^6 @prisma/client@^6 tsx@^4 bcryptjs@^3 2>/dev/null || \
  npm install --no-audit --no-fund prisma@^6 @prisma/client@^6 tsx@^4 bcryptjs@^3
set -a; . ./.env; set +a
# 生成 Prisma Client
./node_modules/.bin/prisma generate
# 直接调本地 bin，避免 npx fallback 下载最新版
./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/tsx prisma/seed.ts
echo "✓ 迁移完成"

echo "▶ 4/4 启动服务..."
systemctl start squad-signup
sleep 2
if systemctl is-active --quiet squad-signup; then
  echo "✓ 服务已启动"
else
  echo "✗ 服务可能未正常启动，查看日志：journalctl -u squad-signup -n 50"
fi
echo ""
echo "✓ 更新完成，访问站点验证"
