#!/usr/bin/env bash
# squad-signup 服务器更新脚本（预构建产物模式）
# 用法：bash update.sh
#   可选环境变量：ADMIN_NICKNAME / ADMIN_PASSWORD（仅库为空时用于补建初始管理员，
#                 默认 admin/123456；已有用户则跳过，不会覆盖现有账号）
#
# 核心思路：不在服务器上构建！直接下载 GitHub Actions 预构建的产物。
# 服务器只做：停服务 → 下载产物 → 跑迁移 → 幂等创建初始管理员（跳过或补建）→ 启动。
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
PROBE_DIR=""
cleanup() {
  [[ -n "$TMP_TAR" && -f "$TMP_TAR" ]] && rm -f "$TMP_TAR"
  [[ -n "$TMP_EXTRACT" && -d "$TMP_EXTRACT" ]] && rm -rf "$TMP_EXTRACT"
  [[ -n "$TMP_ENV_BACKUP" && -f "$TMP_ENV_BACKUP" ]] && rm -f "$TMP_ENV_BACKUP"
  [[ -n "$PROBE_DIR" && -d "$PROBE_DIR" ]] && rm -rf "$PROBE_DIR"
}
trap cleanup EXIT

# ---------------- 工具函数 ----------------
die()  { echo "✗ $*" >&2; exit 1; }
warn() { echo "! $*" >&2; }

# ---------------- Node.js 版本管理 ----------------
MIN_NODE_MAJOR=24
NVM_VERSION="v0.39.7"

need_cmd() { command -v "$1" >/dev/null 2>&1; }

node_major() {
  node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0
}

install_node_nvm() {
  local nvm_dir="$HOME/.nvm"
  echo "▶ 通过 nvm 安装 Node.js v${MIN_NODE_MAJOR} ..."
  curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash
  # shellcheck disable=SC1091
  . "$nvm_dir/nvm.sh"
  nvm install "${MIN_NODE_MAJOR}"
  nvm use "${MIN_NODE_MAJOR}"
  nvm alias default "${MIN_NODE_MAJOR}"
}

install_node() {
  if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
    if need_cmd apt-get; then
      echo "▶ 通过 NodeSource 安装 Node.js v${MIN_NODE_MAJOR} (apt) ..."
      curl -fsSL "https://deb.nodesource.com/setup_${MIN_NODE_MAJOR}.x" | bash -
      apt-get install -y nodejs
      return 0
    elif need_cmd dnf; then
      curl -fsSL "https://rpm.nodesource.com/setup_${MIN_NODE_MAJOR}.x" | bash -
      dnf install -y nodejs
      return 0
    elif need_cmd yum; then
      curl -fsSL "https://rpm.nodesource.com/setup_${MIN_NODE_MAJOR}.x" | bash -
      yum install -y nodejs
      return 0
    fi
  fi
  install_node_nvm
}

ensure_node() {
  if need_cmd node; then
    local major; major=$(node_major)
    if (( major >= MIN_NODE_MAJOR )); then
      echo "✓ Node.js $(node -v) 已就绪"
      return 0
    fi
    warn "Node.js $(node -v) 版本过低，需 >= v${MIN_NODE_MAJOR}，开始升级..."
  else
    warn "未检测到 Node.js，开始安装..."
  fi
  install_node
  hash -r 2>/dev/null || true
  if ! need_cmd node; then
    die "Node.js 安装失败，请手动安装 Node.js v${MIN_NODE_MAJOR}+ 后重试"
  fi
  local major2; major2=$(node_major)
  if (( major2 < MIN_NODE_MAJOR )); then
    die "安装后 Node.js 版本仍为 $(node -v)，不满足 v${MIN_NODE_MAJOR}+ 要求"
  fi
  echo "✓ Node.js $(node -v) 已安装"
}

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

# 检查/升级 Node 到 >=24（nvm 装的 node 可能需要 source nvm.sh）
if ! command -v node >/dev/null 2>&1 && [[ -f "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
fi
ensure_node
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

# ---------------- 下载源自动测速 ----------------
# 内置多个 GitHub 加速镜像 + 原生地址，并行测速后按速度排序下载（失败自动切换）
# 镜像可用性随时间变化，因此每次更新都重新测速，不持久化固定选择
GITHUB_MIRRORS=(
  "https://ghfast.top/"
  "https://gh-proxy.com/"
  "https://ghproxy.net/"
  "https://ghproxy.cn/"
  "https://github.moeyy.xyz/"
  "https://gh.ddlc.top/"
)

# 候选前缀 = MIRROR_URL（优先）+ 内置镜像 + 原生兜底
PREFIXES=()
[[ -n "$MIRROR_URL" ]] && PREFIXES+=("${MIRROR_URL%/}/")
for m in "${GITHUB_MIRRORS[@]}"; do
  [[ "${MIRROR_URL%/}/" == "$m" ]] || PREFIXES+=("$m")
done
PREFIXES+=("")

echo "▶ 测速选择下载源（${#PREFIXES[@]} 个候选，并行探测）..."
PROBE_DIR=$(mktemp -d)
URLS=()
idx=0
for pfx in "${PREFIXES[@]}"; do
  url="${pfx}${DIST_URL}"
  URLS+=("$url")
  (
    t=$(curl -fsS -o /dev/null -w '%{time_total}' \
          --connect-timeout 4 --max-time 8 -r 0-1023 "$url" 2>/dev/null) || t="999.999"
    printf '%s' "${t:-999.999}" > "$PROBE_DIR/$idx"
  ) &
  idx=$((idx + 1))
done
wait

# 汇总测速结果并按耗时排序（数值升序；999.999 = 不可达，自然排最后）
PROBE_RESULT="$PROBE_DIR/result"
: > "$PROBE_RESULT"
idx=0
for url in "${URLS[@]}"; do
  t=$(cat "$PROBE_DIR/$idx" 2>/dev/null || true)
  [[ -z "$t" ]] && t="999.999"
  printf '%s %s\n' "$t" "$url" >> "$PROBE_RESULT"
  idx=$((idx + 1))
done

DOWNLOAD_URLS=()
while read -r t url; do
  [[ -z "${url:-}" ]] && continue
  DOWNLOAD_URLS+=("$url")
  name=${url#https://}; name=${name%%/*}
  if [[ "$t" == "999.999" ]]; then
    echo "  ✗ $name 不可达"
  else
    echo "  ✓ $name ${t}s"
  fi
done < <(LC_ALL=C sort -k1,1g "$PROBE_RESULT")
rm -rf "$PROBE_DIR"; PROBE_DIR=""
echo "✓ 已按测速结果确定下载顺序（最快源优先，失败自动切换下一个）"

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
  echo "✗ 下载失败（已自动测速并依次尝试全部源）。可能原因："
  echo "  1. GitHub Actions 还在构建中（查看：https://github.com/${REPO}/actions）"
  echo "  2. 网络问题——稍后重试，或指定其他镜像候选："
  echo "     MIRROR_URL=https://你熟悉的镜像前缀/ bash update.sh"
  echo "  3. 所有内置镜像与 GitHub 原生均不可达"
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
if ! grep -q '^TRUST_PROXY=' "$INSTALL_DIR/.env" 2>/dev/null; then
  echo "TRUST_PROXY='true'" >> "$INSTALL_DIR/.env"
  echo "✓ 已向 .env 补充 TRUST_PROXY 配置"
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
echo "✓ 数据库迁移完成"

# 幂等创建初始管理员（复用 prisma/create-admin.ts，与 install.sh / deploy.sh 同源）：
# 库中已有用户则直接跳过，不会复活已删除数据；仅在「库为空」时创建
# （覆盖首次安装中断后重跑 update.sh 的恢复场景，避免无管理员可登录）。
# 未显式指定时用默认值 admin/123456；密码仅内存传递，不写入 .env、不落盘。
ADMIN_NICKNAME="${ADMIN_NICKNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-123456}"
echo "▶ 幂等创建初始管理员（已有用户则跳过）..."
ADMIN_NICKNAME="$ADMIN_NICKNAME" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  ./node_modules/.bin/tsx prisma/create-admin.ts \
  || die "初始管理员创建失败，服务未启动。手动修复后重跑：bash update.sh"

# 注意：不执行 seed.ts！
# seed 只在首次 install.sh 时执行，update 时执行会导致已删除的干员/标签/管理员复活
# 如需手动重新 seed（表为空时才会插入，不会复活已删数据）：
#   cd /opt/squad-signup && set -a; . ./.env; set +a && ./node_modules/.bin/tsx prisma/seed.ts

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

# 运行用户：沿用现有服务的 User（install.sh 按 sudo 调用者配置），
# 避免更新后服务被重置为 root、uploads 等文件属主漂移
service_user="root"
if [[ -f /etc/systemd/system/squad-signup.service ]]; then
  existing_user=$(grep -E '^User=' /etc/systemd/system/squad-signup.service | head -1 | cut -d= -f2)
  [[ -n "$existing_user" ]] && service_user="$existing_user"
fi

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
User=$service_user

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
