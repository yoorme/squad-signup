#!/bin/bash
# ===== squad-signup 一键部署脚本 =====
set -e

echo "========================================="
echo "  squad-signup 部署脚本"
echo "========================================="

# 1. 检查环境
echo ""
echo "==> [1/7] 检查环境..."
echo "OS: $(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2)"
echo "内存: $(free -h | awk '/^Mem:/{print $2}')"
echo "磁盘: $(df -h / | awk 'NR==2{print $4 " 可用"}')"

if ! command -v docker &> /dev/null; then
  echo "错误: docker 未安装！请先通过 1Panel 安装 Docker。"
  exit 1
fi
echo "Docker: $(docker --version)"
echo "Compose: $(docker compose version 2>&1 || docker-compose --version 2>&1)"

# 2. 克隆代码
echo ""
echo "==> [2/7] 克隆代码..."
DEPLOY_DIR="/opt/squad-signup"
if [ -d "$DEPLOY_DIR" ]; then
  echo "目录已存在，拉取最新代码..."
  cd "$DEPLOY_DIR"
  git pull || echo "警告: git pull 失败，使用现有代码"
else
  git clone https://github.com/yoorme/squad-signup.git "$DEPLOY_DIR"
  cd "$DEPLOY_DIR"
fi
echo "当前代码版本: $(git log --oneline -1)"

# 3. 创建 .env 配置文件 + 询问端口与初始管理员（仅首次部署）
echo ""
echo "==> [3/7] 创建 .env 配置文件..."
ADMIN_NICKNAME="${ADMIN_NICKNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-123456}"
if [ -f ".env" ]; then
  echo ".env 已存在，跳过创建（如需重置请先删除 .env）"
else
  # 所有密钥现场随机生成，不落仓库、不复用默认值
  GENERATED_DB_PASSWORD=$(openssl rand -hex 16)
  GENERATED_AUTH_SECRET=$(openssl rand -base64 32)
  # 自动探测服务器公网 IP（失败则留待手动修改）
  SERVER_IP=$(curl -fsSL --max-time 5 ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")

  # 服务端口：终端询问（默认 3000，校验 1-65535）
  while true; do
    printf "? 服务端口 [3000]: "
    read -r INPUT_PORT </dev/tty 2>/dev/null || INPUT_PORT=""
    [ -z "$INPUT_PORT" ] && INPUT_PORT="3000"
    if echo "$INPUT_PORT" | grep -qE '^[1-9][0-9]{0,4}$' && [ "$INPUT_PORT" -le 65535 ]; then
      break
    fi
    echo "端口不合法：需 1-65535 的整数"
  done
  APP_PORT="$INPUT_PORT"

  # 初始管理员：终端直接询问（默认 admin/123456，密码不写入 .env 不落盘）
  echo ""
  echo "--- 初始管理员账户 ---"
  echo "登录用「昵称」，系统自动拼接战队前缀组成完整用户名。"
  printf "? 初始管理员账户 [admin]: "
  read -r INPUT_NICK </dev/tty 2>/dev/null || INPUT_NICK=""
  [ -n "$INPUT_NICK" ] && ADMIN_NICKNAME="$INPUT_NICK"
  printf "? 初始管理员密码（输入不回显）[123456]: "
  read -rs INPUT_PW </dev/tty 2>/dev/null || INPUT_PW=""
  printf "\n"
  [ -n "$INPUT_PW" ] && ADMIN_PASSWORD="$INPUT_PW"

  cat > .env << EOF
# PostgreSQL 数据库
POSTGRES_USER=squad
POSTGRES_PASSWORD=${GENERATED_DB_PASSWORD}
POSTGRES_DB=squad_signup

# NextAuth 密钥（已随机生成；轮换会使所有用户重新登录）
AUTH_SECRET=${GENERATED_AUTH_SECRET}

# 战队名称前缀（默认空 = 无前缀；之后在管理后台「战队管理」中修改）
TEAM_PREFIX=

# 服务端口（容器对外暴露端口）
PORT=${APP_PORT}

# 站点 URL（如探测不准确请手动改为实际 IP/域名）
NEXTAUTH_URL=http://${SERVER_IP}:${APP_PORT}

# 信任 Host（用 IP 访问必须为 true；用 HTTPS 域名可设为 false）
AUTH_TRUST_HOST=true

# 上传文件持久目录（容器内路径，对应 compose 的 uploads 卷）
UPLOAD_DIR=/app/uploads
EOF
  chmod 600 .env
  echo ".env 已创建（密钥均为随机生成）"
fi
echo "--- .env 内容（密码已隐藏）---"
sed -E 's/(PASSWORD|SECRET)=.*/\1=***/' .env

# 4. 检查安全组/防火墙（端口取自 .env 的 PORT，默认 3000）
APP_PORT=$(grep '^PORT=' .env 2>/dev/null | cut -d= -f2)
APP_PORT="${APP_PORT:-3000}"
echo ""
echo "==> [4/7] 检查防火墙（端口 $APP_PORT）..."
if command -v firewall-cmd &> /dev/null; then
  echo "firewalld 状态: $(firewall-cmd --state 2>&1)"
  echo "已放行端口: $(firewall-cmd --list-ports 2>&1)"
  echo "尝试放行 $APP_PORT 端口..."
  firewall-cmd --permanent --add-port=${APP_PORT}/tcp 2>&1 && firewall-cmd --reload 2>&1 || echo "（需手动放行或安全组已配置）"
elif command -v ufw &> /dev/null; then
  echo "ufw 状态: $(ufw status 2>&1)"
else
  echo "未检测到 firewalld/ufw，请确保云安全组已放行 $APP_PORT 端口"
fi

# 5. 构建并启动
echo ""
echo "==> [5/7] 构建并启动容器（首次构建约 5-10 分钟，请耐心等待）..."
docker compose down 2>/dev/null || true
docker compose up -d --build 2>&1

# 6. 等待启动（healthcheck 通过 = 迁移+seed 完成、应用已监听）
echo ""
echo "==> [6/7] 等待应用启动..."
HEALTH="starting"
for i in $(seq 1 60); do
  HEALTH=$(docker inspect --format='{{.State.Health.Status}}' squad-signup-app 2>/dev/null || echo "unknown")
  [ "$HEALTH" = "healthy" ] && break
  sleep 5
done
if [ "$HEALTH" = "healthy" ]; then
  echo "应用已就绪"
else
  echo "警告: 等待超时（当前状态: $HEALTH），继续后续步骤"
fi

# 7. 创建初始管理员（终端收集的账户/密码在此写入数据库）
# 复用 prisma/create-admin.ts：幂等，库中已有用户则跳过（更新部署安全）
# 密码仅通过环境变量显式传值进容器（-e KEY=VAL），不写入 .env、不落盘
echo ""
echo "==> [7/7] 创建初始管理员..."
if docker compose exec -T \
  -e ADMIN_NICKNAME="$ADMIN_NICKNAME" \
  -e ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  app npx tsx prisma/create-admin.ts; then
  echo "✓ 初始管理员已就绪（账户: $ADMIN_NICKNAME）"
else
  echo "警告: 初始管理员创建失败，可稍后手动执行："
  echo "  cd /opt/squad-signup && docker compose exec -e ADMIN_NICKNAME=admin -e ADMIN_PASSWORD=新密码 app npx tsx prisma/create-admin.ts"
fi

echo ""
echo "--- 容器状态 ---"
docker compose ps
echo ""
echo "--- 应用日志（最后 30 行）---"
docker compose logs --tail=30 app 2>&1

echo ""
echo "========================================="
echo "  部署完成！"
echo "========================================="
echo ""
echo "访问地址: $(grep '^NEXTAUTH_URL=' .env | cut -d= -f2)"
echo "初始管理员: $ADMIN_NICKNAME（首次部署时终端创建；网站直接登录即可）"
echo ""
echo "如无法访问，请检查："
echo "1. 云服务商安全组是否放行 $APP_PORT 端口（TCP 入方向）"
echo "2. 服务器防火墙是否放行 $APP_PORT 端口"
echo "3. 查看日志: cd /opt/squad-signup && docker compose logs -f app"
echo ""
echo "常用命令："
echo "  查看日志: cd /opt/squad-signup && docker compose logs -f app"
echo "  重启应用: cd /opt/squad-signup && docker compose restart app"
echo "  更新代码: cd /opt/squad-signup && git pull && docker compose up -d --build"
