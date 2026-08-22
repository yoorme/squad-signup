#!/usr/bin/env bash
# shellcheck disable=SC1090,SC1091
# ============================================================================
# squad-signup 一键安装 / 更新脚本（预构建产物模式）
# 三角洲行动战队赛事报名系统（Next.js + Prisma + PostgreSQL）
#
# 核心思路：不在服务器上构建！构建在 GitHub Actions 上完成。
# 服务器只负责下载预构建产物 + 配置 .env + 跑迁移 + 启动。
# 彻底告别小内存服务器构建 OOM 崩溃问题。
#
# 用法：
#   新增/重装战队网站：
#     curl -fsSL https://raw.githubusercontent.com/yoorme/squad-signup/main/install.sh | bash
#
#   指定参数：
#     curl -fsSL ... | bash -s -- --update
#     curl -fsSL ... | bash -s -- --update-all
#     curl -fsSL ... | bash -s -- --uninstall
#     curl -fsSL ... | bash -s -- --status
#
#   更新所有实例请使用：
#     curl -fsSL https://raw.githubusercontent.com/yoorme/squad-signup/main/update.sh | bash
#
#   非交互（自动化部署）：
#     DATABASE_URL=... DIRECT_URL=... NEXTAUTH_URL=https://... \
#       curl -fsSL ... | NONINTERACTIVE=1 bash
#     可选：PORT=8080（服务端口，默认 3000）
#           TEAM_PREFIX=XX丨（战队名称前缀，默认空 = 无前缀，
#           首次安装时写入数据库，之后在管理后台「战队管理」中修改）
#           ADMIN_NICKNAME=admin（初始管理员账户，默认 admin）
#           ADMIN_PASSWORD=xxx（初始管理员密码，默认 123456）
#     下载源：内置多个 GitHub 加速镜像 + 原生地址，自动并行测速选最快的，
#           失败自动切换下一个；也可用 MIRROR_URL 指定额外的镜像候选
# ============================================================================

set -euo pipefail

# ---------------- 中断恢复 ----------------
# 跟踪所有临时文件：脚本被 Ctrl+C / 断网 / 异常中断退出时自动清理，避免 /tmp 残留
TMP_TAR=""
TMP_EXTRACT=""
TMP_ENV_BACKUP=""
TMP_PROBE_DIR=""
cleanup() {
  [[ -n "$TMP_TAR" && -f "$TMP_TAR" ]] && rm -f "$TMP_TAR"
  [[ -n "$TMP_EXTRACT" && -d "$TMP_EXTRACT" ]] && rm -rf "$TMP_EXTRACT"
  [[ -n "$TMP_ENV_BACKUP" && -f "$TMP_ENV_BACKUP" ]] && rm -f "$TMP_ENV_BACKUP"
  [[ -n "$TMP_PROBE_DIR" && -d "$TMP_PROBE_DIR" ]] && rm -rf "$TMP_PROBE_DIR"
  return 0
}
trap cleanup EXIT

# ---------------- 全局配置 ----------------
REPO="yoorme/squad-signup"
BRANCH="${BRANCH:-main}"
# 预构建产物下载地址（GitHub Release，由 GitHub Actions 自动构建上传）
DIST_URL="https://github.com/${REPO}/releases/download/latest/dist.tar.gz"
DEFAULT_PORT="${PORT:-3000}"
MIN_NODE_MAJOR=24
NVM_VERSION="v0.39.7"
# 国内加速镜像前缀（可选）：设置为 https://ghproxy.com/ 等可加速 GitHub Release 下载
# 下载时优先用镜像，失败自动回退到 GitHub 原生地址
MIRROR_URL="${MIRROR_URL:-}"

# 安装目录：root 默认 /opt/squad-signup，普通用户默认 ~/squad-signup
if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
  DEFAULT_INSTALL_DIR="/opt/squad-signup"
  SYSTEM_CONF="/etc/squad-signup.conf"
else
  DEFAULT_INSTALL_DIR="$HOME/squad-signup"
  SYSTEM_CONF=""
fi
INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"

# 多实例支持：共享同一份 standalone/prisma 代码，实例数据放在 instances/<id> 下。
# 旧版单实例（$INSTALL_DIR/.env）仍作为 legacy 实例兼容保留。
INSTANCE_ROOT="${INSTALL_DIR}/instances"
INSTANCE_ID=""
INSTANCE_DIR=""
INSTANCE_ENV=""
SERVICE_NAME="squad-signup"

# ---------------- 颜色输出 ----------------
if [[ "${FORCE_COLOR:-1}" != "0" ]] && { [[ -t 2 ]] || [[ -n "${CI:-}" ]]; }; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'
  C_BLUE=$'\033[34m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_RED=$'\033[31m'; C_CYAN=$'\033[36m'
else
  C_RESET=""; C_BOLD=""; C_BLUE=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_CYAN=""
fi

log()  { printf "%s▶%s %s\n"   "$C_BLUE"   "$C_RESET" "$*" >&2; }
ok()   { printf "%s✓%s %s\n"   "$C_GREEN"  "$C_RESET" "$*" >&2; }
warn() { printf "%s!%s %s\n"   "$C_YELLOW" "$C_RESET" "$*" >&2; }
err()  { printf "%s✗%s %s\n"   "$C_RED"     "$C_RESET" "$*" >&2; }
die()  { err "$*"; exit 1; }

# ---------------- 交互输入 ----------------
is_interactive() {
  [[ "${NONINTERACTIVE:-0}" != "1" ]] && [[ -e /dev/tty ]]
}

ask() {
  local var="$1" msg="$2" def="${3:-}" val=""
  if is_interactive; then
    printf "%s?%s %s%s [%s]:%s " "$C_CYAN" "$C_RESET" "$C_BOLD" "$msg" "$def" "$C_RESET" >&2
    IFS= read -r val </dev/tty || true
  fi
  [[ -z "$val" ]] && val="$def"
  printf -v "$var" '%s' "$val"
}

# 隐藏输入（用于密码）：输入不回显，直接回车 = 使用默认值
ask_secret() {
  local var="$1" msg="$2" def="${3:-}" val=""
  if is_interactive; then
    printf "%s?%s %s%s [%s]:%s " "$C_CYAN" "$C_RESET" "$C_BOLD" "$msg" "$def" "$C_RESET" >&2
    IFS= read -rs val </dev/tty || true
    printf '\n' >&2
  fi
  [[ -z "$val" ]] && val="$def"
  printf -v "$var" '%s' "$val"
}

confirm() {
  local msg="$1" def="${2:-y}" yn=""
  local hint; [[ "$def" == y ]] && hint="Y/n" || hint="y/N"
  if is_interactive; then
    printf "%s?%s %s%s [%s]:%s " "$C_CYAN" "$C_RESET" "$C_BOLD" "$msg" "$hint" "$C_RESET" >&2
    IFS= read -r yn </dev/tty || true
  else
    yn="$def"
  fi
  if [[ "$def" == y ]]; then [[ ! "$yn" =~ ^[Nn]$ ]]; else [[ "$yn" =~ ^[Yy]$ ]]; fi
}

# ---------------- 工具检测 ----------------
need_cmd() { command -v "$1" >/dev/null 2>&1; }

has_systemd() {
  [[ ${EUID:-$(id -u)} -eq 0 ]] && [[ -d /run/systemd/system ]] && need_cmd systemctl
}

server_ip() {
  local ip=""
  ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1); exit}') || true
  if [[ -z "$ip" ]]; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}') || true
  fi
  [[ -z "$ip" ]] && ip="127.0.0.1"
  printf '%s' "$ip"
}

# ---------------- Node.js 安装（仅运行时，不需要构建） ----------------
node_major() {
  node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0
}

ensure_node() {
  if need_cmd node; then
    local major; major=$(node_major)
    if (( major >= MIN_NODE_MAJOR )); then
      ok "Node.js $(node -v) 已就绪"
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
  ok "Node.js $(node -v) 已安装"
}

install_node() {
  if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
    if need_cmd apt-get; then
      log "通过 NodeSource 安装 Node.js v${MIN_NODE_MAJOR} (apt) ..."
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

install_node_nvm() {
  local nvm_dir="$HOME/.nvm"
  log "通过 nvm 安装 Node.js v${MIN_NODE_MAJOR} ..."
  curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash
  # shellcheck disable=SC1091
  . "$nvm_dir/nvm.sh"
  nvm install "${MIN_NODE_MAJOR}"
  nvm use "${MIN_NODE_MAJOR}"
  nvm alias default "${MIN_NODE_MAJOR}"
}

# ---------------- 系统依赖 ----------------
ensure_base_tools() {
  local missing=()
  need_cmd git    || missing+=(git)
  need_cmd curl   || missing+=(curl)
  need_cmd openssl|| missing+=(openssl)
  need_cmd tar    || missing+=(tar)
  if [[ ${#missing[@]} -eq 0 ]]; then return 0; fi
  if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
    if need_cmd apt-get; then
      log "安装基础依赖：${missing[*]}"
      apt-get update -y && apt-get install -y "${missing[@]}"
      return 0
    elif need_cmd dnf; then dnf install -y "${missing[@]}"; return 0
    elif need_cmd yum; then yum install -y "${missing[@]}"; return 0
    fi
  fi
  die "缺少基础命令：${missing[*]}，请先手动安装。"
}

# ---------------- 下载预构建产物 ----------------
# 内置 GitHub 加速镜像候选（URL 前缀代理：镜像 + https://github.com/...）
# 镜像可用性随时间变化，因此每次下载前先并行测速、自动选最快的源
GITHUB_MIRRORS=(
  "https://ghfast.top/"
  "https://gh-proxy.com/"
  "https://ghproxy.net/"
  "https://ghproxy.cn/"
  "https://github.moeyy.xyz/"
  "https://gh.ddlc.top/"
)

# 并行测速所有候选源（各下载首 1KB 计时），结果写入 SPEED_URLS（快 → 慢）
# 候选 = 用户配置的 MIRROR_URL（优先）+ 内置镜像 + GitHub 原生（兜底）
# 探测失败的源排在最后（探测用 Range 请求，个别不支持 Range 的镜像可能被
# 误判，但下载循环仍会按顺序尝试它们，不会真正丢失候选）
probe_sources() {
  local -a prefixes=()
  if [[ -n "$MIRROR_URL" ]]; then
    prefixes+=("${MIRROR_URL%/}/")
  fi
  local mir
  for mir in "${GITHUB_MIRRORS[@]}"; do
    [[ "${MIRROR_URL%/}/" == "$mir" ]] || prefixes+=("$mir")
  done
  prefixes+=("")  # 空前缀 = GitHub 原生

  log "测速选择下载源（${#prefixes[@]} 个候选，并行探测）..."
  TMP_PROBE_DIR=$(mktemp -d)
  local -a urls=()
  local i=0 pfx url
  for pfx in "${prefixes[@]}"; do
    url="${pfx}${DIST_URL}"
    urls+=("$url")
    (
      t=$(curl -fsS -o /dev/null -w '%{time_total}' \
            --connect-timeout 4 --max-time 8 -r 0-1023 "$url" 2>/dev/null) || t="999.999"
      printf '%s' "${t:-999.999}" > "$TMP_PROBE_DIR/$i"
    ) &
    i=$((i + 1))
  done
  wait

  # 汇总测速结果并按耗时排序（数值升序；999.999 = 不可达，自然排最后）
  local result_file="$TMP_PROBE_DIR/result"
  : > "$result_file"
  i=0
  for url in "${urls[@]}"; do
    local t
    t=$(cat "$TMP_PROBE_DIR/$i" 2>/dev/null || true)
    [[ -z "$t" ]] && t="999.999"
    printf '%s %s\n' "$t" "$url" >> "$result_file"
    i=$((i + 1))
  done

  SPEED_URLS=()
  local name
  while read -r t url; do
    [[ -z "${url:-}" ]] && continue
    SPEED_URLS+=("$url")
    name=${url#https://}; name=${name%%/*}
    if [[ "$t" == "999.999" ]]; then
      printf "  %s✗%s %-22s 不可达\n" "$C_RED" "$C_RESET" "$name" >&2
    else
      printf "  %s✓%s %-22s %ss\n" "$C_GREEN" "$C_RESET" "$name" "$t" >&2
    fi
  done < <(LC_ALL=C sort -k1,1g "$result_file")
  rm -rf "$TMP_PROBE_DIR"; TMP_PROBE_DIR=""
  ok "已按测速结果确定下载顺序（最快源优先，失败自动切换下一个）"
}

# 从 GitHub Release 下载 dist.tar.gz 并解压
# dist.tar.gz 内含 standalone/（运行时）+ prisma/（迁移用）
# 下载策略：先测速排序（probe_sources），再按顺序尝试，全部失败才报错
download_dist() {
  local out="$1"
  [[ -n "${SPEED_URLS[*]:-}" ]] || probe_sources

  local i=1 url
  for url in "${SPEED_URLS[@]}"; do
    log "下载（第 $i/${#SPEED_URLS[@]} 个源）：$url"
    if curl -fsSL --connect-timeout 30 --max-time 300 "$url" -o "$out" && [[ -s "$out" ]]; then
      ok "下载成功（来源：$url）"
      return 0
    fi
    rm -f "$out"
    warn "此源下载失败，尝试下一个..."
    i=$((i + 1))
  done
  return 1
}

# 原子替换目录：旧目录改名 .old 保留 → 移入新目录 → 全部成功后清理 .old；
# 移入失败自动回滚旧版本。任意时刻中断都保证「旧版或新版至少一个完整可用」，
# 中断后重跑本脚本即可继续（auto 模式会把 .old 残留也识别为已安装）
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

# 恢复 .env 备份（无备份则跳过）
restore_env_backup() {
  if [[ -n "$TMP_ENV_BACKUP" ]]; then
    cp "$TMP_ENV_BACKUP" "$INSTALL_DIR/.env"
    rm -f "$TMP_ENV_BACKUP"
    TMP_ENV_BACKUP=""
  fi
}

fetch_dist() {
  log "下载预构建产物..."
  TMP_TAR="/tmp/squad-signup-dist.tar.gz"

  if ! download_dist "$TMP_TAR"; then
    die "下载产物失败。可能原因：
  1. GitHub Actions 还在构建中（查看：https://github.com/${REPO}/actions）
  2. 网络问题——稍后重试，或指定其他镜像候选：
     MIRROR_URL=https://你熟悉的镜像前缀/ bash install.sh
  3. 所有内置镜像与 GitHub 原生均不可达
  （旧版本文件未受影响，可继续运行当前版本，稍后重试更新）"
  fi

  # 校验下载完整性：有效 gzip，防止半截文件进入替换流程
  gzip -t "$TMP_TAR" 2>/dev/null || die "下载的产物不是有效的 gzip（可能下载中断），请重试"
  ok "产物下载完成（$(du -h "$TMP_TAR" | cut -f1)）"

  # 解压到临时目录，校验关键文件无误后再替换，隔离损坏产物的风险
  TMP_EXTRACT=$(mktemp -d)
  tar -xzf "$TMP_TAR" -C "$TMP_EXTRACT"
  rm -f "$TMP_TAR"; TMP_TAR=""
  [[ -f "$TMP_EXTRACT/standalone/server.js" ]] || die "产物中缺少 standalone/server.js，产物不完整"
  [[ -d "$TMP_EXTRACT/prisma" ]] || die "产物中缺少 prisma 目录，产物不完整"

  # 确保 INSTALL_DIR 存在
  mkdir -p "$INSTALL_DIR"

  # 备份 .env（如果存在）
  if [[ -f "$INSTALL_DIR/.env" ]]; then
    TMP_ENV_BACKUP=$(mktemp)
    cp "$INSTALL_DIR/.env" "$TMP_ENV_BACKUP"
  fi

  # 原子替换（保留 .env/.deploy.conf/uploads）
  if ! replace_dir "$TMP_EXTRACT/standalone" "$INSTALL_DIR/standalone" \
     || ! replace_dir "$TMP_EXTRACT/prisma" "$INSTALL_DIR/prisma"; then
    restore_env_backup
    die "产物替换失败，已自动回滚到旧版本。旧版可正常启动，稍后重试更新即可"
  fi
  rm -rf "$TMP_EXTRACT"; TMP_EXTRACT=""

  restore_env_backup
  ok "产物已解压到 $INSTALL_DIR"

  # 上传文件持久目录（独立于 standalone 产物，版本更新不丢图）
  mkdir -p "$INSTALL_DIR/uploads"
}

# ---------------- 生成 .env ----------------
env_escape() {
  local s="$1"
  s="${s//\'/\'\\\'\'}"
  printf "'%s'" "$s"
}

configure_env() {
  local env_file="${1:-$INSTALL_DIR/.env}"
  local upload_dir="${2:-$INSTALL_DIR/uploads}"
  if [[ -f "$env_file" ]]; then
    local existing_db
    existing_db=$(grep '^DATABASE_URL=' "$env_file" 2>/dev/null | sed -E "s/^DATABASE_URL=//; s/^['\"]//; s/['\"]$//" || true)
    if [[ -n "$existing_db" ]]; then
      ok ".env 已存在，保留配置"
      set -a; . "$env_file"; set +a
      return 0
    else
      warn ".env 中 DATABASE_URL 为空，重新配置"
    fi
  fi

  log "配置环境变量（.env）"
  local db_url direct_url auth_secret site_url trust_host trust_proxy port team_prefix

  db_url="${DATABASE_URL:-}"
  direct_url="${DIRECT_URL:-}"
  auth_secret="${AUTH_SECRET:-}"
  team_prefix="${TEAM_PREFIX:-}"
  site_url="${NEXTAUTH_URL:-}"
  trust_host="${AUTH_TRUST_HOST:-true}"
  trust_proxy="${TRUST_PROXY:-true}"
  port="${PORT:-$DEFAULT_PORT}"

  if is_interactive && [[ -z "$db_url" ]]; then
    cat >&2 <<EOF

${C_BOLD}需要 PostgreSQL 数据库连接串${C_RESET}
格式：postgresql://用户:密码@主机:5432/库名?schema=public

EOF
  fi
  ask db_url "PostgreSQL 连接串 DATABASE_URL" "$db_url"
  [[ -z "$db_url" ]] && die "DATABASE_URL 不能为空，无法继续安装"
  ask direct_url "迁移用直连串 DIRECT_URL（回车=同上）" "${direct_url:-$db_url}"
  [[ -z "$direct_url" ]] && direct_url="$db_url"

  # 服务端口：在前缀之前询问，默认 3000，校验合法性（1-65535 整数）
  if is_interactive; then
    cat >&2 <<EOF

${C_BOLD}服务端口${C_RESET}
站点监听的端口（systemd 服务与 NEXTAUTH_URL 都用它）。
直接回车 = 默认 3000；注意避开服务器上已占用的端口。

EOF
  fi
  while true; do
    ask port "服务端口（回车=3000）" "$port"
    # 不允许前导零（避免八进制歧义），纯数字且 1-65535
    if [[ "$port" =~ ^(0|[1-9][0-9]{0,4})$ ]] && (( 10#$port >= 1 && 10#$port <= 65535 )); then
      port=$((10#$port))   # 归一化（去前导零）
      break
    fi
    warn "端口不合法：「$port」必须是 1-65535 的整数"
    port="${PORT:-$DEFAULT_PORT}"
    is_interactive || die "PORT 环境变量不合法（需 1-65535 整数）"
  done
  export PORT="$port"   # 供 setup_systemd / save_deploy_conf / .env 使用

  # 战队名称前缀：仅在此处（首次安装创建 .env）询问；
  # 更新时上方「.env 已存在，保留配置」会提前返回，不会再询问
  # 仅输入战队缩写（如 XX）：落库时统一拼接固定分隔符「丨」成为前缀
  if is_interactive; then
    cat >&2 <<EOF

${C_BOLD}战队缩写（可选）${C_RESET}
用于登录用户名拼接（缩写+固定分隔符丨+昵称，如「XX丨XXX」）与站点标题。
仅输入战队缩写（如 XX），分隔符「丨」由系统自动拼接、不可修改。
直接回车 = 不使用前缀；之后可随时在管理后台「战队管理」中修改。

EOF
  fi
  ask team_prefix "战队缩写（回车=无前缀）" "$team_prefix"

  # 初始管理员：首次部署时在终端直接创建（迁移完成后写入数据库）
  # 默认账户 admin、默认密码 123456；密码不写入 .env（不落盘）
  ADMIN_NICKNAME="${ADMIN_NICKNAME:-admin}"
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-123456}"
  if is_interactive; then
    cat >&2 <<EOF

${C_BOLD}初始管理员账户${C_RESET}
登录用「昵称」，系统自动拼接战队前缀组成完整用户名。
账户默认 admin、密码默认 123456（弱密码仅作占位，登录后请立即修改）。

EOF
  fi
  while true; do
    ask ADMIN_NICKNAME "初始管理员账户（回车=admin）" "$ADMIN_NICKNAME"
    local nick="$ADMIN_NICKNAME"
    if [[ "$nick" =~ ^[^[:space:]]{1,16}$ ]]; then
      if [[ -n "$team_prefix" && "$nick" == "$team_prefix"* ]]; then
        warn "账户无需包含战队前缀「$team_prefix」（系统会自动拼接）"
      else
        break
      fi
    else
      warn "账户不合法：需 1-16 个字符且不含空白"
    fi
    ADMIN_NICKNAME="admin"
    is_interactive || die "ADMIN_NICKNAME 不合法（需 1-16 个字符、不含空白）"
  done
  while true; do
    ask_secret ADMIN_PASSWORD "初始管理员密码（回车=123456）" "$ADMIN_PASSWORD"
    local pw="$ADMIN_PASSWORD"
    if (( ${#pw} >= 6 && ${#pw} <= 64 )); then
      break
    fi
    warn "密码不合法：需 6-64 个字符"
    ADMIN_PASSWORD="123456"
    is_interactive || die "ADMIN_PASSWORD 不合法（需 6-64 个字符）"
  done

  if [[ -z "$auth_secret" ]]; then
    auth_secret=$(openssl rand -base64 32)
    ok "已自动生成 AUTH_SECRET"
  fi
  if [[ -z "$site_url" ]]; then
    site_url="http://$(server_ip):${port}"
  fi
  ask site_url "站点 URL（NEXTAUTH_URL）" "$site_url"

  {
    echo "# 由 install.sh 生成 $(date '+%Y-%m-%d %H:%M:%S')"
    echo "DATABASE_URL=$(env_escape "$db_url")"
    echo "DIRECT_URL=$(env_escape "$direct_url")"
    echo "AUTH_SECRET=$(env_escape "$auth_secret")"
    echo "TEAM_PREFIX=$(env_escape "$team_prefix")"
    echo "PORT=$(env_escape "$port")"
    echo "NEXTAUTH_URL=$(env_escape "$site_url")"
    echo "AUTH_TRUST_HOST=$(env_escape "$trust_host")"
    echo "TRUST_PROXY=$(env_escape "$trust_proxy")"
    echo "UPLOAD_DIR='$upload_dir'"
  } > "$env_file"
  chmod 600 "$env_file"
  ok ".env 已生成（端口 $port，战队前缀：${team_prefix:-无}）"
  set -a; . "$env_file"; set +a
  save_deploy_conf
}

save_deploy_conf() {
  local conf="$INSTALL_DIR/.deploy.conf"
  {
    echo "PORT=$(env_escape "${PORT:-$DEFAULT_PORT}")"
    echo "BRANCH=$(env_escape "$BRANCH")"
    echo "INSTALL_DIR=$(env_escape "$INSTALL_DIR")"
    echo "MIRROR_URL=$(env_escape "$MIRROR_URL")"
  } > "$conf"
  chmod 600 "$conf"
  if [[ -n "$SYSTEM_CONF" ]]; then
    cp "$conf" "$SYSTEM_CONF" 2>/dev/null || true
  fi
}

load_deploy_conf() {
  local conf="$INSTALL_DIR/.deploy.conf"
  if [[ -f "$conf" ]]; then
    set -a; . "$conf"; set +a
  elif [[ -n "$SYSTEM_CONF" && -f "$SYSTEM_CONF" ]]; then
    set -a; . "$SYSTEM_CONF"; set +a
  fi
}

# ---------------- 多实例辅助函数 ----------------
get_env_value() {
  local file="$1" key="$2"
  grep "^${key}=" "$file" 2>/dev/null | head -1 | sed -E "s/^${key}=//; s/^['\"]//; s/['\"]$//" || true
}

# 输出已安装实例：id<US>port<US>prefix<US>url<US>service<US>env_file
# 使用 \037（unit separator）而不是 tab，避免空字段被 read 折叠导致错位。
list_instances() {
  if [[ -f "$INSTALL_DIR/.env" ]]; then
    printf 'legacy\037%s\037%s\037%s\037%s\037%s\n' \
      "$(get_env_value "$INSTALL_DIR/.env" PORT)" \
      "$(get_env_value "$INSTALL_DIR/.env" TEAM_PREFIX)" \
      "$(get_env_value "$INSTALL_DIR/.env" NEXTAUTH_URL)" \
      "squad-signup" \
      "$INSTALL_DIR/.env"
  fi
  if [[ -d "$INSTANCE_ROOT" ]]; then
    for d in "$INSTANCE_ROOT"/*/; do
      [[ -d "$d" && -f "$d/.env" ]] || continue
      local id; id=$(basename "$d")
      printf '%s\037%s\037%s\037%s\037%s\037%s\n' \
        "$id" \
        "$(get_env_value "$d/.env" PORT)" \
        "$(get_env_value "$d/.env" TEAM_PREFIX)" \
        "$(get_env_value "$d/.env" NEXTAUTH_URL)" \
        "squad-signup-$id" \
        "$d/.env"
    done
  fi
}

print_instances() {
  local found=0
  while IFS=$'\037' read -r id port prefix url service env_file; do
    [[ -n "$id" ]] || continue
    found=1
    printf "  - [%s] 端口 %s | 战队前缀：%s | 站点：%s\n" \
      "$id" "$port" "${prefix:-无}" "$url"
  done < <(list_instances)
  [[ "$found" == "1" ]]
}

select_instance_by_id() {
  local target="${1:-}"
  while IFS=$'\037' read -r id port prefix url service env_file; do
    if [[ "$id" == "$target" ]]; then
      INSTANCE_ID="$id"
      INSTANCE_ENV="$env_file"
      SERVICE_NAME="$service"
      if [[ "$id" == "legacy" ]]; then
        INSTANCE_DIR="$INSTALL_DIR"
      else
        INSTANCE_DIR="$INSTANCE_ROOT/$id"
      fi
      return 0
    fi
  done < <(list_instances)
  return 1
}

select_instance_interactive() {
  echo "请选择要重新安装的战队网站："
  local -a ids=()
  while IFS=$'\037' read -r id port prefix url service env_file; do
    ids+=("$id")
    printf "  %d) [%s] 端口 %s | 战队前缀：%s\n" "${#ids[@]}" "$id" "$port" "${prefix:-无}"
  done < <(list_instances)
  if [[ ${#ids[@]} -eq 0 ]]; then
    warn "没有可重新安装的实例"
    return 1
  fi
  local choice=""
  printf "%s?%s 请输入序号 [1]:%s " "$C_CYAN" "$C_RESET" "$C_RESET" >&2
  IFS= read -r choice </dev/tty || choice=""
  [[ -z "$choice" ]] && choice="1"
  if [[ ! "$choice" =~ ^[0-9]+$ ]] || (( choice < 1 || choice > ${#ids[@]} )); then
    warn "无效选择"
    return 1
  fi
  select_instance_by_id "${ids[$((choice-1))]}"
}

prompt_instance_id() {
  local instance_id_input="${INSTANCE_ID:-}"
  while true; do
    ask instance_id_input "实例标识（英文/数字/下划线/连字符，如 team-a）" "$instance_id_input"
    if [[ "$instance_id_input" =~ ^[A-Za-z0-9_-]{1,32}$ ]]; then
      INSTANCE_ID="$instance_id_input"
      INSTANCE_DIR="$INSTANCE_ROOT/$instance_id_input"
      INSTANCE_ENV="$INSTANCE_DIR/.env"
      SERVICE_NAME="squad-signup-$instance_id_input"
      return 0
    fi
    warn "实例标识不合法：需 1-32 位英文/数字/下划线/连字符"
    instance_id_input=""
    is_interactive || die "INSTANCE_ID 不合法"
  done
}

# ---------------- 数据库迁移 ----------------
# 只安装迁移+seed 必需的 4 个包（轻量，不 build，不会 OOM）
# 必须锁版本！否则 npm 会装最新版引入破坏性变更：
#   - prisma v7 不再支持 schema.prisma 的 url/directUrl → 迁移失败
#   - tsx 未来 v5+ 可能调整 Node/ESBuild 要求 → seed 跑不起来
#   - @prisma/client 必须与 prisma CLI 同大版本
#   - bcryptjs seed.ts 用于密码加密
# 与 package.json 对齐：
#   prisma ^6.19.3 / @prisma/client ^6.19.3 / tsx ^4.23.1 / bcryptjs ^3.0.3
run_migrate() {
  cd "$INSTALL_DIR" || die "无法进入 $INSTALL_DIR"
  if [[ -x "$INSTALL_DIR/node_modules/.bin/prisma" && -x "$INSTALL_DIR/node_modules/.bin/tsx" ]]; then
    log "迁移依赖已存在，跳过安装"
  else
    log "安装迁移+seed 必需依赖（prisma@6 @prisma/client@6 tsx@4 bcryptjs@3）..."
    npm install --no-audit --no-fund --no-save prisma@^6 @prisma/client@^6 tsx@^4 bcryptjs@^3 2>/dev/null || \
      npm install --no-audit --no-fund prisma@^6 @prisma/client@^6 tsx@^4 bcryptjs@^3
  fi

  # 生成 Prisma Client（@prisma/client 装好后需 generate 才能使用）
  log "生成 Prisma Client..."
  set -a; . "$INSTANCE_ENV"; set +a
  ./node_modules/.bin/prisma generate

  log "执行数据库迁移 + seed..."
  ./node_modules/.bin/prisma migrate deploy
  ./node_modules/.bin/tsx prisma/seed.ts
  ok "迁移完成"
}

# ---------------- 初始管理员（终端创建） ----------------
# 首次安装时由终端询问账户/密码（configure_env），迁移完成后写入数据库。
# 密码不落盘（仅安装过程内存传递）；库中已有用户则跳过（幂等，重跑安全）。
# 逻辑复用 prisma/create-admin.ts（与 deploy.sh / npm run create-admin 同源）。
create_initial_admin() {
  # 未显式指定时用默认值：安装中断恢复、自动化部署均安全
  ADMIN_NICKNAME="${ADMIN_NICKNAME:-admin}"
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-123456}"
  cd "$INSTALL_DIR" || die "无法进入 $INSTALL_DIR"
  set -a; . "$INSTANCE_ENV"; set +a
  log "创建初始管理员..."
  ADMIN_NICKNAME="$ADMIN_NICKNAME" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    ./node_modules/.bin/tsx prisma/create-admin.ts || die "创建初始管理员失败"
}

# ---------------- 服务管理 ----------------
node_bin_path() { command -v node || die "找不到 node"; }
run_user() { printf '%s' "${SUDO_USER:-$(whoami)}"; }

chown_install_dir() {
  if [[ ${EUID:-$(id -u)} -eq 0 ]] && [[ -n "${SUDO_USER:-}" ]]; then
    local user="$SUDO_USER"
    local group; group=$(id -gn "$user" 2>/dev/null || echo "$user")
    chown -R "$user:$group" "$INSTALL_DIR" 2>/dev/null || true
    ok "已将 $INSTALL_DIR 属主设为 $user"
  fi
}

setup_systemd() {
  local node_bin; node_bin=$(node_bin_path)
  local port="${PORT:-$DEFAULT_PORT}"
  local user; user=$(run_user)
  local env_file="$INSTANCE_ENV"
  local work_dir="$INSTALL_DIR"

  log "配置 systemd 服务..."
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=squad-signup ${INSTANCE_ID:-} (三角洲行动战队赛事报名)
After=network.target

[Service]
Type=simple
WorkingDirectory=$work_dir
EnvironmentFile=$env_file
Environment=NODE_ENV=production
Environment=HOSTNAME=0.0.0.0
ExecStart=$node_bin $work_dir/standalone/server.js
Restart=on-failure
RestartSec=5
User=$user

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true
  ok "systemd 服务已安装（端口 ${port}，服务名 ${SERVICE_NAME}）"
}

setup_nohup() {
  local node_bin; node_bin=$(node_bin_path)
  local port="${PORT:-$DEFAULT_PORT}"
  local env_file="$INSTANCE_ENV"
  local instance_dir="$INSTANCE_DIR"

  mkdir -p "$instance_dir/logs"
  cat > "$instance_dir/start.sh" <<EOF
#!/usr/bin/env bash
cd "$instance_dir" || exit 1
mkdir -p logs
if [ -f .pid ]; then
  old_pid=\$(cat .pid 2>/dev/null)
  if [ -n "\$old_pid" ] && kill -0 "\$old_pid" 2>/dev/null; then
    kill -- -"\$old_pid" 2>/dev/null || kill "\$old_pid" 2>/dev/null || true
    sleep 1
    kill -9 "\$old_pid" 2>/dev/null || true
  fi
  rm -f .pid
fi
export NODE_ENV=production
export HOSTNAME=0.0.0.0
export PORT="$port"
[ -f "$env_file" ] && { set -a; . "$env_file"; set +a; }
if command -v setsid >/dev/null 2>&1; then
  setsid nohup "$node_bin" "$INSTALL_DIR/standalone/server.js" >> logs/app.log 2>&1 &
else
  nohup "$node_bin" "$INSTALL_DIR/standalone/server.js" >> logs/app.log 2>&1 &
fi
echo \$! > .pid
sleep 1
if kill -0 "\$(cat .pid)" 2>/dev/null; then
  echo "已启动 (PID \$(cat .pid))，端口 $port"
else
  echo "启动失败，请查看日志：$INSTALL_DIR/logs/app.log"
  exit 1
fi
EOF
  cat > "$instance_dir/stop.sh" <<EOF
#!/usr/bin/env bash
cd "$instance_dir" || exit 1
if [ -f .pid ]; then
  pid=\$(cat .pid 2>/dev/null)
  rm -f .pid
  if [ -n "\$pid" ] && kill -0 "\$pid" 2>/dev/null; then
    kill -- -"\$pid" 2>/dev/null || kill "\$pid" 2>/dev/null || true
    for i in 1 2 3 4 5 6 7 8 9 10; do
      kill -0 "\$pid" 2>/dev/null || break
      sleep 0.5
    done
    if kill -0 "\$pid" 2>/dev/null; then
      kill -9 "\$pid" 2>/dev/null || true
      kill -9 -- -"\$pid" 2>/dev/null || true
    fi
    echo "已停止"
  else
    echo "进程未运行"
  fi
else
  echo "未运行"
fi
EOF
  chmod +x "$instance_dir/start.sh" "$instance_dir/stop.sh"
  ok "已生成 start.sh / stop.sh（端口 ${port}）"
  warn "当前环境无 systemd，请用 $instance_dir/start.sh 启动"
}

start_service() {
  if has_systemd; then
    log "启动服务..."
    systemctl restart "$SERVICE_NAME"
    sleep 2
    if systemctl is-active --quiet "$SERVICE_NAME"; then
      ok "服务已启动"
    else
      warn "服务可能未正常启动，查看日志：journalctl -u $SERVICE_NAME -n 50"
    fi
  fi
}

# ---------------- 安装 / 更新主流程 ----------------
# 下载源不再手动询问：内置多个镜像 + 原生地址，每次自动并行测速选最快源
# （MIRROR_URL 环境变量仍可指定额外语速候选，优先参与测速）

ensure_shared_runtime() {
  ensure_base_tools
  ensure_node
  load_deploy_conf
  if [[ ! -d "$INSTALL_DIR/standalone" && ! -d "$INSTALL_DIR/standalone.old" ]]; then
    fetch_dist
  else
    log "检测到已有共享运行时，跳过重复下载"
  fi
}

install_new_instance() {
  log "${C_BOLD}新增战队网站（共享运行时）${C_RESET}"
  ensure_shared_runtime
  prompt_instance_id
  mkdir -p "$INSTANCE_DIR"
  INSTANCE_ENV="$INSTANCE_DIR/.env"
  SERVICE_NAME="squad-signup-$INSTANCE_ID"
  configure_env "$INSTANCE_ENV" "$INSTANCE_DIR/uploads"
  run_migrate
  create_initial_admin
  chown_install_dir
  if has_systemd; then setup_systemd; else setup_nohup; fi
  start_service
  print_summary
}

reinstall_existing_instance() {
  log "${C_BOLD}重新安装已有战队网站${C_RESET}"
  ensure_shared_runtime
  if [[ -z "${INSTANCE_ID:-}" ]]; then
    select_instance_interactive || die "未选择实例"
  else
    select_instance_by_id "$INSTANCE_ID" || die "实例 $INSTANCE_ID 不存在"
  fi
  set -a; . "$INSTANCE_ENV"; set +a
  mkdir -p "${INSTANCE_DIR:-$INSTALL_DIR}/uploads"
  run_migrate
  create_initial_admin
  chown_install_dir
  if has_systemd; then setup_systemd; else setup_nohup; fi
  start_service
  print_summary
}

do_install() {
  log "${C_BOLD}战队网站管理（多实例）${C_RESET}"
  if is_interactive && [[ -z "${INSTANCE_ID:-}" ]]; then
    echo "当前服务器已安装的战队网站："
    if print_instances; then :; else
      echo "  （无）"
    fi
    echo ""
    echo "请选择操作："
    echo "  1) 新增战队网站"
    echo "  2) 重新安装已有战队网站"
    local choice=""
    printf "%s?%s 请输入序号 [1]:%s " "$C_CYAN" "$C_RESET" "$C_RESET" >&2
    IFS= read -r choice </dev/tty || choice=""
    [[ -z "$choice" ]] && choice="1"
    if [[ "$choice" == "1" ]]; then
      install_new_instance
    elif [[ "$choice" == "2" ]]; then
      reinstall_existing_instance
    else
      die "无效选择"
    fi
  else
    if [[ -n "${INSTANCE_ID:-}" ]] && select_instance_by_id "$INSTANCE_ID"; then
      reinstall_existing_instance
    else
      install_new_instance
    fi
  fi
}

do_update() {
  log "${C_BOLD}install.sh 仅负责新增/重装战队网站；更新所有实例请使用 update.sh${C_RESET}"
  if [[ -f "$INSTALL_DIR/update.sh" ]]; then
    bash "$INSTALL_DIR/update.sh"
  else
    curl -fsSL "https://raw.githubusercontent.com/${REPO}/main/update.sh" | bash
  fi
}

do_update_all() {
  log "${C_BOLD}更新所有战队网站到同一版本（数据/端口分离）${C_RESET}"
  ensure_base_tools
  ensure_node
  load_deploy_conf

  # 先停止全部实例，避免替换 standalone 时文件占用
  local -a service_names=()
  while IFS=$'\037' read -r id port prefix url service env_file; do
    service_names+=("$service")
    if has_systemd; then
      systemctl stop "$service" 2>/dev/null || true
    else
      local stop_script
      if [[ "$id" == "legacy" ]]; then stop_script="$INSTALL_DIR/stop.sh"; else stop_script="$INSTANCE_ROOT/$id/stop.sh"; fi
      [[ -f "$stop_script" ]] && bash "$stop_script" 2>/dev/null || true
    fi
  done < <(list_instances)

  fetch_dist

  # 安装一次共享迁移依赖
  cd "$INSTALL_DIR" || die "无法进入 $INSTALL_DIR"
  log "安装共享迁移依赖..."
  npm install --no-audit --no-fund --no-save prisma@^6 @prisma/client@^6 tsx@^4 bcryptjs@^3 2>/dev/null || \
    npm install --no-audit --no-fund prisma@^6 @prisma/client@^6 tsx@^4 bcryptjs@^3
  ./node_modules/.bin/prisma generate

  while IFS=$'\037' read -r id port prefix url service env_file; do
    log "更新实例 [${id}]（端口 ${port}）..."
    INSTANCE_ID="$id"
    INSTANCE_ENV="$env_file"
    SERVICE_NAME="$service"
    if [[ "$id" == "legacy" ]]; then INSTANCE_DIR="$INSTALL_DIR"; else INSTANCE_DIR="$INSTANCE_ROOT/$id"; fi
    set -a; . "$INSTANCE_ENV"; set +a
    mkdir -p "$INSTANCE_DIR/uploads"
    set -a; . "$INSTANCE_ENV"; set +a
    ./node_modules/.bin/prisma migrate deploy
    ADMIN_NICKNAME="${ADMIN_NICKNAME:-admin}" ADMIN_PASSWORD="${ADMIN_PASSWORD:-123456}" \
      ./node_modules/.bin/tsx prisma/create-admin.ts || warn "实例 ${id} 初始管理员创建跳过或失败（已有用户时正常）"
    chown_install_dir
    if has_systemd; then
      setup_systemd
      systemctl start "$SERVICE_NAME" 2>/dev/null || warn "实例 ${id} 启动失败，请查看日志"
    else
      setup_nohup
    fi
  done < <(list_instances)

  ok "全部实例更新完成"
}

do_uninstall() {
  if [[ -n "$(list_instances)" ]]; then
    die "检测到已安装战队网站。多实例模式下请勿使用 --uninstall 删除共享代码；请手动删除对应实例目录和服务，或重新运行安装脚本选择重装。"
  fi
  log "${C_BOLD}卸载 squad-signup${C_RESET}"
  safe_rm_install_dir() {
    [[ -n "$INSTALL_DIR" ]] || { warn "INSTALL_DIR 为空，跳过删除"; return 0; }
    [[ "$INSTALL_DIR" != "/" ]] || { warn "INSTALL_DIR 为 /，拒绝删除"; return 0; }
    if [[ "$INSTALL_DIR" != *squad-signup* ]] && [[ ! -f "$INSTALL_DIR/.env" ]] && [[ ! -d "$INSTALL_DIR/standalone" ]]; then
      warn "$INSTALL_DIR 不像安装目录，跳过删除"
      return 0
    fi
    rm -rf "$INSTALL_DIR"
  }
  if has_systemd; then
    systemctl stop squad-signup 2>/dev/null || true
    systemctl disable squad-signup 2>/dev/null || true
    rm -f /etc/systemd/system/squad-signup.service
    systemctl daemon-reload 2>/dev/null || true
  else
    if [[ -f "$INSTALL_DIR/stop.sh" ]]; then
      bash "$INSTALL_DIR/stop.sh" 2>/dev/null || true
    fi
    if [[ -f "$INSTALL_DIR/.pid" ]]; then
      local pid; pid=$(cat "$INSTALL_DIR/.pid" 2>/dev/null || true)
      if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
        sleep 1
        kill -9 "$pid" 2>/dev/null || true
        kill -9 -- -"$pid" 2>/dev/null || true
      fi
      rm -f "$INSTALL_DIR/.pid"
    fi
  fi
  if is_interactive; then
    if confirm "是否删除代码与数据目录 $INSTALL_DIR？" n; then
      safe_rm_install_dir && ok "已删除 $INSTALL_DIR"
    else
      warn "保留 $INSTALL_DIR"
    fi
  else
    safe_rm_install_dir
  fi
  [[ -n "$SYSTEM_CONF" ]] && rm -f "$SYSTEM_CONF"
  if command -v crontab >/dev/null 2>&1; then
    local cur_crontab
    cur_crontab=$(crontab -l 2>/dev/null || true)
    if [[ -n "$cur_crontab" ]] && echo "$cur_crontab" | grep -q "$INSTALL_DIR/start.sh"; then
      echo "$cur_crontab" | grep -v "$INSTALL_DIR/start.sh" | crontab - 2>/dev/null || true
      ok "已清理 crontab 中的开机自启条目"
    fi
  fi
  ok "卸载完成"
}

do_status() {
  log "${C_BOLD}squad-signup 多实例状态${C_RESET}"
  echo "共享代码目录：$INSTALL_DIR $([[ -d "$INSTALL_DIR/standalone" ]] && echo '[已安装]' || echo '[未安装]')"
  echo "Node.js ：$(need_cmd node && node -v || echo '未安装')"
  echo ""
  echo "已安装实例："
  local found=0
  while IFS=$'\037' read -r id port prefix url service env_file; do
    [[ -n "$id" ]] || continue
    found=1
    local state="未知"
    if has_systemd; then
      state=$(systemctl is-active "$service" 2>/dev/null || echo '未运行')
    elif { [[ "$id" == "legacy" && -f "$INSTALL_DIR/.pid" ]] || [[ -f "$INSTANCE_ROOT/$id/.pid" ]]; }; then
      local pid_file
      [[ "$id" == "legacy" ]] && pid_file="$INSTALL_DIR/.pid" || pid_file="$INSTANCE_ROOT/$id/.pid"
      state=$(kill -0 "$(cat "$pid_file" 2>/dev/null)" 2>/dev/null && echo '运行中' || echo '已停止')
    fi
    printf "  - [%s] 端口 %s | 前缀：%s | 状态：%s\n  URL：%s\n" "$id" "$port" "${prefix:-无}" "$state" "$url"
  done < <(list_instances)
  [[ "$found" == "1" ]] || echo "  （无）"
}

print_summary() {
  local port="${PORT:-$DEFAULT_PORT}"
  cat >&2 <<EOF

${C_GREEN}${C_BOLD}✓ squad-signup 安装完成${C_RESET}

  目录：$INSTALL_DIR
  端口：$port
  站点：${NEXTAUTH_URL:-http://$(server_ip):$port}
  初始管理员：${TEAM_PREFIX:-}${ADMIN_NICKNAME:-admin}
EOF
  if [[ "${ADMIN_PASSWORD:-}" == "123456" ]]; then
    cat >&2 <<EOF
${C_YELLOW}  ! 当前使用默认密码 123456，请登录后立即在「个人设置」中修改！${C_RESET}
EOF
  fi
  cat >&2 <<EOF

EOF
  if has_systemd; then
    cat >&2 <<EOF
  常用命令：
    systemctl status ${SERVICE_NAME}     # 查看状态
    systemctl restart ${SERVICE_NAME}    # 重启
    journalctl -u ${SERVICE_NAME} -f     # 查看日志
EOF
  else
    cat >&2 <<EOF
  启动/停止：
    $INSTANCE_DIR/start.sh
    $INSTANCE_DIR/stop.sh
    tail -f $INSTANCE_DIR/logs/app.log
EOF
  fi
  cat >&2 <<EOF

  更新：curl -fsSL https://raw.githubusercontent.com/${REPO}/main/update.sh | bash
EOF
}

usage() {
  sed -n '3,20p' "$0" 2>/dev/null || cat <<EOF
用法：bash install.sh [--install|--update|--uninstall|--status|--help]
  无参数    已安装则更新，未安装则安装
  --install 强制安装
  --update  强制更新
  --update-all 更新所有已安装实例（推荐用 update.sh）
  --uninstall 卸载
  --status  查看状态
  --help    显示帮助
EOF
}

# ---------------- 入口 ----------------
main() {
  local action="auto"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --install)    action="install" ;;
      --update)     action="update" ;;
      --update-all) action="update_all" ;;
      --uninstall)  action="uninstall" ;;
      --status)     action="status" ;;
      -h|--help)    usage; exit 0 ;;
      *) die "未知参数：$1（用 --help 查看用法）" ;;
    esac
    shift
  done

  [[ "$action" == "status" ]] && { do_status; exit 0; }
  [[ "$action" == "uninstall" ]] && { do_uninstall; exit 0; }

  if [[ "$action" == "auto" ]]; then
    action="install"
  fi

  case "$action" in
    install) do_install ;;
    update)  do_update ;;
    update_all) do_update_all ;;
  esac
}

main "$@"
