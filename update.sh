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
# 国内加速镜像前缀（可选）：从 .deploy.conf 读取，或用环境变量 MIRROR_URL 覆盖
# 下载时优先用镜像，失败自动回退 GitHub 原生
MIRROR_URL="${MIRROR_URL:-}"

# 临时文件路径（trap 退出时清理，避免残留）
TMP_TAR=""
TMP_EXTRACT=""
TMP_ENV_BACKUP=""
cleanup() {
  [[ -n "$TMP_TAR" && -f "$TMP_TAR" ]] && rm -f "$TMP_TAR"
  [[ -n "$TMP_EXTRACT" && -d "$TMP_EXTRACT" ]] && rm -rf "$TMP_EXTRACT"
  [[ -n "$TMP_ENV_BACKUP" && -f "$TMP_ENV_BACKUP" ]] && rm -f "$TMP_ENV_BACKUP"
}
trap cleanup EXIT

# ---------------- 工具函数 ----------------
die()  { echo "✗ $*" >&2; exit 1; }
warn() { echo "! $*" >&2; }

# ================================================================
# 前置检查（失败立即退出，不浪费时间）
# ================================================================

cd "$INSTALL_DIR" 2>/dev/null || die "无法进入 $INSTALL_DIR（请先用 install.sh 安装）"

# 检查 .env 存在（迁移和运行都依赖它）
[[ -f "$INSTALL_DIR/.env" ]] || die "$INSTALL_DIR/.env 不存在，无法更新。请先用 install.sh 安装"

# 从 .deploy.conf 读取持久化的镜像配置（install.sh 时设置，环境变量 MIRROR_URL 优先级更高）
if [[ -f "$INSTALL_DIR/.deploy.conf" ]]; then
  conf_mirror=$(grep '^MIRROR_URL=' "$INSTALL_DIR/.deploy.conf" 2>/dev/null \
    | sed -E "s/^MIRROR_URL=//; s/^['\"]//; s/['\"]$//" || true)
  # 仅当环境变量未显式覆盖时才采用 .deploy.conf 的值
  if [[ -z "$MIRROR_URL" && -n "$conf_mirror" ]]; then
    MIRROR_URL="$conf_mirror"
  fi
fi

# 检查 node 可用（nvm 装的 node 可能需要 source nvm.sh）
if ! command -v node >/dev/null 2>&1; then
  if [[ -f "$HOME/.nvm/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    . "$HOME/.nvm/nvm.sh"
    nvm use 20 2>/dev/null || nvm use default 2>/dev/null || true
  fi
fi
command -v node >/dev/null 2>&1 || die "找不到 node，请先安装 Node.js v20+ 或 source nvm"
NODE_BIN=$(command -v node)

# 检查磁盘空间（产物约 50MB + 解压 + node_modules，至少需要 500MB）
avail_mb=$(df -m "$INSTALL_DIR" 2>/dev/null | awk 'NR==2 {print $4}')
if [[ "${avail_mb:-0}" -lt 500 ]]; then
  die "磁盘空间不足（可用 ${avail_mb:-未知}MB，需 500MB），请清理后重试"
fi

echo "▶ 1/5 停止服务..."
systemctl stop squad-signup 2>/dev/null || true
echo "✓ 服务已停止"

# ================================================================
# 下载预构建产物
# ================================================================
echo "▶ 2/5 下载预构建产物..."
TMP_TAR="/tmp/squad-signup-dist-$$.tar.gz"

# 构建下载源列表：若配置了镜像则优先用镜像，原生 GitHub 始终作为兜底
DOWNLOAD_URLS=()
if [[ -n "$MIRROR_URL" ]]; then
  mirror="${MIRROR_URL%/}"
  DOWNLOAD_URLS+=("${mirror}/${DIST_URL}")
fi
DOWNLOAD_URLS+=("$DIST_URL")

download_ok=false
i=1
total=${#DOWNLOAD_URLS[@]}
for url in "${DOWNLOAD_URLS[@]}"; do
  echo "  尝试第 ${i}/${total} 个源：$url"
  if curl -fsSL --connect-timeout 30 --max-time 300 "$url" -o "$TMP_TAR" && [[ -s "$TMP_TAR" ]]; then
    echo "✓ 下载成功（来源：$url）"
    download_ok=true
    break
  fi
  rm -f "$TMP_TAR"
  echo "! 此源下载失败，尝试下一个..."
  i=$((i + 1))
done

if [[ "$download_ok" != "true" ]]; then
  echo "✗ 下载失败。可能原因："
  echo "  1. GitHub Actions 还在构建中（查看：https://github.com/${REPO}/actions）"
  echo "  2. 网络问题——国内服务器可设置镜像加速："
  echo "     MIRROR_URL=https://ghproxy.com/ bash update.sh"
  echo "  3. 镜像不可用——已自动回退 GitHub 原生仍失败"
  # 自动恢复：旧版本文件未受影响，尝试直接把旧版启动回来，站点不中断
  if [[ -f "$INSTALL_DIR/standalone/server.js" ]]; then
    echo "  正在尝试恢复启动旧版本..."
    systemctl start squad-signup 2>/dev/null || true
    if systemctl is-active --quiet squad-signup 2>/dev/null; then
      echo "✓ 旧版本已恢复运行，站点不受影响，稍后重新执行更新即可"
    else
      echo "  旧版本未能自动启动，可手动恢复：systemctl start squad-signup"
    fi
  fi
  exit 1
fi

# 校验下载文件：非空 + 有效 gzip
[[ -s "$TMP_TAR" ]] || die "下载的文件为空，GitHub Release 可能不存在产物"
gzip -t "$TMP_TAR" 2>/dev/null || die "下载的文件不是有效的 gzip，可能下载不完整，请重试"
echo "✓ 产物下载完成（$(du -h "$TMP_TAR" | cut -f1)）"

# ================================================================
# 解压 + 校验完整性 + 替换
# ================================================================
TMP_EXTRACT=$(mktemp -d)
tar -xzf "$TMP_TAR" -C "$TMP_EXTRACT"
rm -f "$TMP_TAR"
TMP_TAR=""

# 校验产物完整性（缺少关键文件说明产物构建有问题）
[[ -d "$TMP_EXTRACT/standalone" ]] || die "产物中缺少 standalone 目录，产物不完整"
[[ -f "$TMP_EXTRACT/standalone/server.js" ]] || die "产物中缺少 standalone/server.js，产物不完整"
[[ -d "$TMP_EXTRACT/prisma" ]] || die "产物中缺少 prisma 目录，产物不完整"

# 备份 .env（替换产物时保护配置）
TMP_ENV_BACKUP=$(mktemp)
cp "$INSTALL_DIR/.env" "$TMP_ENV_BACKUP"

# 原子替换目录：旧目录改名 .old 保留 → 移入新目录 → 全部成功后清理 .old；
# 移入失败自动回滚旧版本。任意时刻中断都保证「旧版或新版至少一个完整可用」，
# 中断后重跑 update.sh 即可继续
replace_dir() {
  local src="$1" dst="$2"
  local old="${dst}.old"
  if [[ -e "$dst" ]]; then
    rm -rf "$old"
    mv "$dst" "$old"
  fi
  if mv "$src" "$dst"; then
    rm -rf "$old"
    return 0
  fi
  # 移入失败：回滚旧版本
  if [[ -e "$old" ]]; then
    rm -rf "$dst"
    mv "$old" "$dst" || die "严重：回滚失败，请手动检查 $INSTALL_DIR 目录"
  fi
  return 1
}
if ! replace_dir "$TMP_EXTRACT/standalone" "$INSTALL_DIR/standalone" \
   || ! replace_dir "$TMP_EXTRACT/prisma" "$INSTALL_DIR/prisma"; then
  cp "$TMP_ENV_BACKUP" "$INSTALL_DIR/.env"
  rm -f "$TMP_ENV_BACKUP"; TMP_ENV_BACKUP=""
  die "产物替换失败，已自动回滚到旧版本。旧版可正常启动，稍后重试更新即可"
fi
rm -rf "$TMP_EXTRACT"
TMP_EXTRACT=""

# 恢复 .env
cp "$TMP_ENV_BACKUP" "$INSTALL_DIR/.env"
rm -f "$TMP_ENV_BACKUP"
TMP_ENV_BACKUP=""

# 上传文件持久目录（独立于 standalone 产物，版本更新不丢图）
mkdir -p "$INSTALL_DIR/uploads"
if ! grep -q '^UPLOAD_DIR=' "$INSTALL_DIR/.env" 2>/dev/null; then
  echo "UPLOAD_DIR='$INSTALL_DIR/uploads'" >> "$INSTALL_DIR/.env"
  echo "✓ 已向 .env 补充 UPLOAD_DIR 配置"
fi
echo "✓ 产物已更新"

# ================================================================
# 安装迁移依赖 + 数据库迁移
# ================================================================
echo "▶ 3/5 安装迁移依赖..."
# 装齐 seed.ts 的所有依赖（必须锁版本，否则 npm 装最新版引入破坏性变更）
#   prisma@^6        与 package.json 对齐，规避 v7 破坏性变更（schema.prisma 不再支持 url）
#   @prisma/client@^6 与 package.json 对齐，seed.ts 需要
#   tsx@^4           运行 TypeScript seed
#   bcryptjs@^3      seed.ts 密码加密
npm install --no-audit --no-fund --no-save prisma@^6 @prisma/client@^6 tsx@^4 bcryptjs@^3 \
  || die "npm install 失败（网络问题？），迁移未执行，服务未启动。手动修复后重跑：bash update.sh"

# 检查 bin 文件确实装上了（npm install 可能因网络返回非0但不报错）
[[ -x "./node_modules/.bin/prisma" ]] || die "prisma 安装失败（node_modules/.bin/prisma 不存在）"
[[ -x "./node_modules/.bin/tsx" ]] || die "tsx 安装失败（node_modules/.bin/tsx 不存在）"

echo "▶ 4/5 数据库迁移..."
set -a; . ./.env; set +a

# 生成 Prisma Client（@prisma/client 装好后需 generate 才能使用）
./node_modules/.bin/prisma generate \
  || die "prisma generate 失败，服务未启动。手动修复后重跑：bash update.sh"

# 跑迁移（失败则退出——数据库结构不匹配时服务可能无法运行）
./node_modules/.bin/prisma migrate deploy \
  || die "数据库迁移失败，服务未启动。检查 DATABASE_URL 是否正确，或手动修复后重跑：bash update.sh"

# 注意：不执行 seed.ts！
# seed 只在首次 install.sh 时执行，update 时执行会导致已删除的干员/标签/管理员复活
# 如需手动重新 seed（表为空时才会插入，不会复活已删数据）：
#   cd /opt/squad-signup && set -a; . ./.env; set +a && ./node_modules/.bin/tsx prisma/seed.ts
echo "✓ 数据库迁移完成"

# ================================================================
# 重新配置 systemd 服务 + 启动
# ================================================================
echo "▶ 5/5 重新配置 systemd 服务 + 启动..."
# 重新生成 systemd 服务文件（预构建产物用 standalone/server.js，不是 next start）
# 旧版 install.sh 创建的服务用 node_modules/.bin/next start，预构建模式下该文件不存在

# port 优先级：.env 的 PORT > .deploy.conf 的 PORT > 3000
port="3000"
if [[ -f "$INSTALL_DIR/.deploy.conf" ]]; then
  conf_port=$(grep '^PORT=' "$INSTALL_DIR/.deploy.conf" 2>/dev/null | sed -E "s/^PORT=//; s/^['\"]//; s/['\"]$//" || true)
  [[ -n "$conf_port" ]] && port="$conf_port"
fi
env_port=$(grep '^PORT=' "$INSTALL_DIR/.env" 2>/dev/null | sed -E "s/^PORT=//; s/^['\"]//; s/['\"]$//" || true)
[[ -n "$env_port" ]] && port="$env_port"

cat > /etc/systemd/system/squad-signup.service <<EOF
[Unit]
Description=squad-signup (三角洲行动战队赛事报名)
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
Environment=NODE_ENV=production
Environment=HOSTNAME=0.0.0.0
Environment=PORT=$port
ExecStart=$NODE_BIN $INSTALL_DIR/standalone/server.js
Restart=on-failure
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable squad-signup >/dev/null 2>&1 || true
echo "✓ systemd 服务已更新（端口 $port，ExecStart=$NODE_BIN standalone/server.js）"

systemctl start squad-signup
sleep 3
if systemctl is-active --quiet squad-signup; then
  echo "✓ 服务已启动"
  # 验证端口监听
  if command -v ss >/dev/null 2>&1; then
    if ss -tlnp | grep -q ":$port "; then
      echo "✓ 端口 $port 正在监听"
    else
      warn "端口 $port 未监听，查看日志：journalctl -u squad-signup -n 50"
    fi
  fi
else
  echo "✗ 服务启动失败！"
  echo "  查看日志：journalctl -u squad-signup -n 50"
  echo "  常见原因："
  echo "    1. 端口 $port 被占用：ss -tlnp | grep :$port"
  echo "    2. .env 配置错误：cat $INSTALL_DIR/.env"
  echo "    3. 数据库连不上：检查 DATABASE_URL"
  echo "  修复后重启：systemctl restart squad-signup"
fi
echo ""
echo "✓ 更新完成，访问站点验证"
