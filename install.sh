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
#   安装或更新（自动识别）：
#     curl -fsSL https://raw.githubusercontent.com/yoorme/squad-signup/main/install.sh | bash
#
#   指定参数：
#     curl -fsSL ... | bash -s -- --update
#     curl -fsSL ... | bash -s -- --uninstall
#     curl -fsSL ... | bash -s -- --status
#
#   非交互（自动化部署）：
#     DATABASE_URL=... DIRECT_URL=... NEXTAUTH_URL=https://... \
#       curl -fsSL ... | NONINTERACTIVE=1 bash
# ============================================================================

set -euo pipefail

# ---------------- 全局配置 ----------------
REPO="yoorme/squad-signup"
BRANCH="${BRANCH:-main}"
# 预构建产物下载地址（GitHub Release，由 GitHub Actions 自动构建上传）
DIST_URL="https://github.com/${REPO}/releases/download/latest/dist.tar.gz"
DEFAULT_PORT="${PORT:-3000}"
MIN_NODE_MAJOR=20
NVM_VERSION="v0.39.7"

# 安装目录：root 默认 /opt/squad-signup，普通用户默认 ~/squad-signup
if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
  DEFAULT_INSTALL_DIR="/opt/squad-signup"
  SYSTEM_CONF="/etc/squad-signup.conf"
else
  DEFAULT_INSTALL_DIR="$HOME/squad-signup"
  SYSTEM_CONF=""
fi
INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"

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
# 从 GitHub Release 下载 dist.tar.gz 并解压
# dist.tar.gz 内含 standalone/（运行时）+ prisma/（迁移用）
fetch_dist() {
  log "下载预构建产物（GitHub Release）..."
  local tmp_tar="/tmp/squad-signup-dist.tar.gz"

  if ! curl -fsSL "$DIST_URL" -o "$tmp_tar"; then
    die "下载产物失败。GitHub Actions 可能还在构建中，请稍后重试（查看：https://github.com/${REPO}/actions）"
  fi
  ok "产物下载完成（$(du -h "$tmp_tar" | cut -f1)）"

  # 解压到临时目录，再移动到目标位置（保留已有的 .env）
  local tmp_extract; tmp_extract=$(mktemp -d)
  tar -xzf "$tmp_tar" -C "$tmp_extract"
  rm -f "$tmp_tar"

  # 确保 INSTALL_DIR 存在
  mkdir -p "$INSTALL_DIR"

  # 备份 .env（如果存在）
  local env_backup=""
  if [[ -f "$INSTALL_DIR/.env" ]]; then
    env_backup=$(mktemp)
    cp "$INSTALL_DIR/.env" "$env_backup"
  fi

  # 清除旧的 standalone/prisma（保留 .env/.deploy.conf）
  rm -rf "$INSTALL_DIR/standalone" "$INSTALL_DIR/prisma"

  # 移动新产物
  mv "$tmp_extract/standalone" "$INSTALL_DIR/standalone"
  mv "$tmp_extract/prisma" "$INSTALL_DIR/prisma"
  rm -rf "$tmp_extract"

  # 恢复 .env
  if [[ -n "$env_backup" ]]; then
    cp "$env_backup" "$INSTALL_DIR/.env"
    rm -f "$env_backup"
  fi

  ok "产物已解压到 $INSTALL_DIR"
}

# ---------------- 生成 .env ----------------
env_escape() {
  local s="$1"
  s="${s//\'/\'\\\'\'}"
  printf "'%s'" "$s"
}

configure_env() {
  local env_file="$INSTALL_DIR/.env"
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
  local db_url direct_url auth_secret admin_user admin_pass site_url trust_host port

  db_url="${DATABASE_URL:-}"
  direct_url="${DIRECT_URL:-}"
  auth_secret="${AUTH_SECRET:-}"
  admin_user="${INITIAL_ADMIN_USERNAME:-MMR丨Admin}"
  admin_pass="${INITIAL_ADMIN_PASSWORD:-admin123456}"
  site_url="${NEXTAUTH_URL:-}"
  trust_host="${AUTH_TRUST_HOST:-true}"
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

  if [[ -z "$auth_secret" ]]; then
    auth_secret=$(openssl rand -base64 32)
    ok "已自动生成 AUTH_SECRET"
  fi
  ask admin_user "初始管理员用户名" "$admin_user"
  ask admin_pass "初始管理员密码" "$admin_pass"
  if [[ -z "$site_url" ]]; then
    site_url="http://$(server_ip):${port}"
  fi
  ask site_url "站点 URL（NEXTAUTH_URL）" "$site_url"

  {
    echo "# 由 install.sh 生成 $(date '+%Y-%m-%d %H:%M:%S')"
    echo "DATABASE_URL=$(env_escape "$db_url")"
    echo "DIRECT_URL=$(env_escape "$direct_url")"
    echo "AUTH_SECRET=$(env_escape "$auth_secret")"
    echo "INITIAL_ADMIN_USERNAME=$(env_escape "$admin_user")"
    echo "INITIAL_ADMIN_PASSWORD=$(env_escape "$admin_pass")"
    echo "NEXTAUTH_URL=$(env_escape "$site_url")"
    echo "AUTH_TRUST_HOST=$(env_escape "$trust_host")"
  } > "$env_file"
  chmod 600 "$env_file"
  ok ".env 已生成"
  set -a; . "$env_file"; set +a
  save_deploy_conf
}

save_deploy_conf() {
  local conf="$INSTALL_DIR/.deploy.conf"
  {
    echo "PORT=$(env_escape "${PORT:-$DEFAULT_PORT}")"
    echo "BRANCH=$(env_escape "$BRANCH")"
    echo "INSTALL_DIR=$(env_escape "$INSTALL_DIR")"
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

# ---------------- 数据库迁移 ----------------
# 只安装 prisma + tsx（轻量，不 build，不会 OOM）
run_migrate() {
  cd "$INSTALL_DIR" || die "无法进入 $INSTALL_DIR"
  log "安装 prisma + tsx（仅迁移用，不构建）..."
  npm install --no-audit --no-fund --no-save prisma tsx 2>/dev/null || \
    npm install --no-audit --no-fund prisma tsx

  log "执行数据库迁移 + seed..."
  set -a; . "$INSTALL_DIR/.env"; set +a
  npx prisma migrate deploy
  npx tsx prisma/seed.ts
  ok "迁移完成"
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
  local env_file="$INSTALL_DIR/.env"
  local work_dir
  if [[ "$INSTALL_DIR" = /* ]]; then
    work_dir="$INSTALL_DIR"
  else
    work_dir=$(cd "$INSTALL_DIR" 2>/dev/null && pwd) || work_dir="$INSTALL_DIR"
  fi

  log "配置 systemd 服务..."
  cat > /etc/systemd/system/squad-signup.service <<EOF
[Unit]
Description=squad-signup (三角洲行动战队赛事报名)
After=network.target

[Service]
Type=simple
WorkingDirectory=${work_dir}
EnvironmentFile=${env_file}
Environment=NODE_ENV=production
Environment=HOSTNAME=0.0.0.0
Environment=PORT=${port}
ExecStart=${node_bin} ${work_dir}/standalone/server.js
Restart=on-failure
RestartSec=5
User=${user}

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable squad-signup >/dev/null 2>&1 || true
  ok "systemd 服务已安装（端口 ${port}）"
}

setup_nohup() {
  local node_bin; node_bin=$(node_bin_path)
  local port="${PORT:-$DEFAULT_PORT}"

  cat > "$INSTALL_DIR/start.sh" <<EOF
#!/usr/bin/env bash
cd "$INSTALL_DIR" || exit 1
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
[ -f .env ] && { set -a; . ./.env; set +a; }
if command -v setsid >/dev/null 2>&1; then
  setsid nohup "$node_bin" standalone/server.js >> logs/app.log 2>&1 &
else
  nohup "$node_bin" standalone/server.js >> logs/app.log 2>&1 &
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
  cat > "$INSTALL_DIR/stop.sh" <<EOF
#!/usr/bin/env bash
cd "$INSTALL_DIR" || exit 1
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
  chmod +x "$INSTALL_DIR/start.sh" "$INSTALL_DIR/stop.sh"
  ok "已生成 start.sh / stop.sh（端口 ${port}）"
  warn "当前环境无 systemd，请用 ./start.sh 启动"
}

start_service() {
  if has_systemd; then
    log "启动服务..."
    systemctl restart squad-signup
    sleep 2
    if systemctl is-active --quiet squad-signup; then
      ok "服务已启动"
    else
      warn "服务可能未正常启动，查看日志：journalctl -u squad-signup -n 50"
    fi
  fi
}

# ---------------- 安装 / 更新主流程 ----------------
do_install() {
  log "${C_BOLD}安装 squad-signup（预构建产物模式）${C_RESET}"
  ensure_base_tools
  ensure_node
  fetch_dist
  load_deploy_conf
  configure_env
  run_migrate
  chown_install_dir
  if has_systemd; then setup_systemd; else setup_nohup; fi
  start_service
  print_summary
}

do_update() {
  log "${C_BOLD}更新 squad-signup（预构建产物模式）${C_RESET}"
  [[ -d "$INSTALL_DIR" ]] || die "$INSTALL_DIR 不存在，请用 --install 安装"
  ensure_base_tools
  ensure_node
  load_deploy_conf
  # 先停服务（释放端口）
  if has_systemd; then
    systemctl stop squad-signup 2>/dev/null || true
  elif [[ -f "$INSTALL_DIR/stop.sh" ]]; then
    bash "$INSTALL_DIR/stop.sh" 2>/dev/null || true
  fi
  fetch_dist
  configure_env   # 已有 .env 时仅加载
  run_migrate
  chown_install_dir
  if has_systemd; then
    setup_systemd
    start_service
  else
    setup_nohup
    warn "请手动重启：./stop.sh && ./start.sh"
  fi
  ok "更新完成"
}

do_uninstall() {
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
  log "${C_BOLD}squad-signup 状态${C_RESET}"
  echo "安装目录：$INSTALL_DIR $([[ -d "$INSTALL_DIR/standalone" ]] && echo '[已安装]' || echo '[未安装]')"
  echo "Node.js ：$(need_cmd node && node -v || echo '未安装')"
  if has_systemd; then
    echo "systemd ：$(systemctl is-active squad-signup 2>/dev/null || echo '未运行')"
  else
    if [[ -f "$INSTALL_DIR/.pid" ]]; then
      echo "进程 PID：$(cat "$INSTALL_DIR/.pid" 2>/dev/null) ($(kill -0 "$(cat "$INSTALL_DIR/.pid" 2>/dev/null)" 2>/dev/null && echo '运行中' || echo '已停止'))"
    else
      echo "进程    ：未启动"
    fi
  fi
  if [[ -f "$INSTALL_DIR/.env" ]]; then
    echo "站点 URL：$(grep '^NEXTAUTH_URL=' "$INSTALL_DIR/.env" | sed -E 's/^NEXTAUTH_URL=//; s/^['\''\"]//; s/['\''\"]$//')"
    echo "数据库 ：$(grep '^DATABASE_URL=' "$INSTALL_DIR/.env" | sed -E 's/^DATABASE_URL=//; s/^['\''\"]//; s/['\''\"]$//; s|://[^@]+@|://***@|')"
  fi
}

print_summary() {
  local port="${PORT:-$DEFAULT_PORT}"
  cat >&2 <<EOF

${C_GREEN}${C_BOLD}✓ squad-signup 安装完成${C_RESET}

  目录：$INSTALL_DIR
  端口：$port
  站点：${NEXTAUTH_URL:-http://$(server_ip):$port}

EOF
  if has_systemd; then
    cat >&2 <<EOF
  常用命令：
    systemctl status squad-signup     # 查看状态
    systemctl restart squad-signup    # 重启
    journalctl -u squad-signup -f     # 查看日志
EOF
  else
    cat >&2 <<EOF
  启动/停止：
    $INSTALL_DIR/start.sh
    $INSTALL_DIR/stop.sh
    tail -f $INSTALL_DIR/logs/app.log
EOF
  fi
  cat >&2 <<EOF

  更新：curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash
EOF
}

usage() {
  sed -n '3,20p' "$0" 2>/dev/null || cat <<EOF
用法：bash install.sh [--install|--update|--uninstall|--status|--help]
  无参数    已安装则更新，未安装则安装
  --install 强制安装
  --update  强制更新
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
    [[ -d "$INSTALL_DIR/standalone" ]] && action="update" || action="install"
  fi

  case "$action" in
    install) do_install ;;
    update)  do_update ;;
  esac
}

main "$@"
