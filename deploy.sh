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

# 3. 创建 .env 配置文件
echo ""
echo "==> [3/7] 创建 .env 配置文件..."
if [ -f ".env" ]; then
  echo ".env 已存在，跳过创建（如需重置请先删除 .env）"
  GENERATED_ADMIN_PASSWORD=""
else
  # 所有密钥现场随机生成，不落仓库、不复用默认值
  GENERATED_DB_PASSWORD=$(openssl rand -hex 16)
  GENERATED_AUTH_SECRET=$(openssl rand -base64 32)
  GENERATED_ADMIN_PASSWORD=$(openssl rand -hex 8)
  # 自动探测服务器公网 IP（失败则留待手动修改）
  SERVER_IP=$(curl -fsSL --max-time 5 ifconfig.me 2>/dev/null || echo "YOUR_SERVER_IP")
  cat > .env << EOF
# PostgreSQL 数据库
POSTGRES_USER=squad
POSTGRES_PASSWORD=${GENERATED_DB_PASSWORD}
POSTGRES_DB=squad_signup

# NextAuth 密钥（已随机生成；轮换会使所有用户重新登录）
AUTH_SECRET=${GENERATED_AUTH_SECRET}

# 初始管理员（随机初始密码仅在本脚本末尾显示一次，请立即登录修改）
INITIAL_ADMIN_USERNAME=MMR丨Admin
INITIAL_ADMIN_PASSWORD=${GENERATED_ADMIN_PASSWORD}

# 站点 URL（如探测不准确请手动改为实际 IP/域名）
NEXTAUTH_URL=http://${SERVER_IP}:3000

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

# 4. 检查安全组/防火墙
echo ""
echo "==> [4/7] 检查防火墙..."
if command -v firewall-cmd &> /dev/null; then
  echo "firewalld 状态: $(firewall-cmd --state 2>&1)"
  echo "已放行端口: $(firewall-cmd --list-ports 2>&1)"
  echo "尝试放行 3000 端口..."
  firewall-cmd --permanent --add-port=3000/tcp 2>&1 && firewall-cmd --reload 2>&1 || echo "（需手动放行或安全组已配置）"
elif command -v ufw &> /dev/null; then
  echo "ufw 状态: $(ufw status 2>&1)"
else
  echo "未检测到 firewalld/ufw，请确保阿里云安全组已放行 3000 端口"
fi

# 5. 构建并启动
echo ""
echo "==> [5/7] 构建并启动容器（首次构建约 5-10 分钟，请耐心等待）..."
docker compose down 2>/dev/null || true
docker compose up -d --build 2>&1

# 6. 等待启动
echo ""
echo "==> [6/7] 等待应用启动..."
echo "等待 30 秒..."
sleep 30

# 7. 检查状态
echo ""
echo "==> [7/7] 检查容器状态..."
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
echo "登录账号: MMR丨Admin"
if [ -n "${GENERATED_ADMIN_PASSWORD:-}" ]; then
  echo "登录密码: ${GENERATED_ADMIN_PASSWORD}  （仅本次显示，请立即登录后修改）"
else
  echo "登录密码: 使用 .env 中既有配置"
fi
echo ""
echo "如无法访问，请检查："
echo "1. 阿里云安全组是否放行 3000 端口（TCP 入方向）"
echo "2. 服务器防火墙是否放行 3000 端口"
echo "3. 查看日志: cd /opt/squad-signup && docker compose logs -f app"
echo ""
echo "常用命令："
echo "  查看日志: cd /opt/squad-signup && docker compose logs -f app"
echo "  重启应用: cd /opt/squad-signup && docker compose restart app"
echo "  更新代码: cd /opt/squad-signup && git pull && docker compose up -d --build"
